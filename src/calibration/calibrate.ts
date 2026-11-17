import { grabFrame } from '../camera';
import type { Stage } from '../stage';
import { clearWhite } from '../stage';
import type { Gray, H } from '../types';
import { invertH, solveHomography, wallMask } from './homography';
import { findBlobs } from '../vision/blobs';
import { dilate } from '../vision/shadowMask';
import type { Mask } from '../types';
import { drawCalibrationPattern, findMarkersDetailed } from './pattern';

export type Calibration = { camToProj: H; projToCam: H; whiteRef: Gray; dark: Gray; method?: 'squares' | 'picture' };

/** Calibration failed: carries what the camera saw, for the setup card. */
export class CalibrationError extends Error {
  constructor(readonly seen: number, readonly lit: Gray, readonly changed: Mask) {
    super(seen === 0
      ? "can't see the projected squares at all — is the camera pointing at the projected picture?"
      : seen >= 4
        ? "found the 4 squares, but they don't line up with the projected picture — check nothing else bright (a lamp, a window) is in the camera view"
        : `only saw ${seen} of the 4 squares — make sure the whole picture is in view and nothing blocks the light`);
  }
}

// The projector (keystone processing) and webcam both lag; wait longer on the retry.
const PATTERN_WAITS_MS = [900, 1600];

/** The last calibration's camera frames (ordinary brightness), for saving when it fails. */
export let lastCalibrationFrames: { dark: Gray; squares: Gray; white: Gray } | null = null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Average several frames to suppress projector (DLP) flicker. */
type Pair = { luma: Gray };
async function grabAveraged(video: HTMLVideoElement, n = 5): Promise<Pair> {
  const frames: Pair[] = [];
  for (let i = 0; i < n; i++) {
    frames.push(grabFrame(video));
    await wait(40);
  }
  const avg = (key: keyof Pair): Gray => {
    const { width, height } = frames[0][key];
    const data = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i++) {
      let s = 0;
      for (const f of frames) s += f[key].data[i];
      data[i] = s / n;
    }
    return { width, height, data };
  };
  return { luma: avg('luma') };
}

/** Wait (up to 2 s) until the webcam's auto-exposure has stopped changing the picture. */
async function settle(video: HTMLVideoElement): Promise<void> {
  const mean = () => { const g = grabFrame(video, 80, 60).luma; let s = 0; for (const v of g.data) s += v; return s / g.data.length; };
  await wait(300);
  let prev = mean();
  for (let t = 0; t < 2000; t += 150) {
    await wait(150);
    const m = mean();
    if (Math.abs(m - prev) <= Math.max(1, prev * 0.02)) return;
    prev = m;
  }
}

/**
 * Full calibration: homography + white/dark reference frames. With `keep`
 * (automatic re-alignment, the performer may be in the beam) only the
 * homography is redone and the reference frames are kept.
 */
export async function runCalibration(stage: Stage, video: HTMLVideoElement, keep?: Calibration): Promise<Calibration> {
  const { w, h } = stage.size();
  stage.ctx.setTransform(1, 0, 0, 1, 0, 0);
  stage.ctx.fillStyle = '#000';
  stage.ctx.fillRect(0, 0, w, h);
  await settle(video);
  const dark = await grabAveraged(video);
  // First with the squares near the corners; if that doesn't add up (part of the picture is outside
  // the camera view, low contrast), again with the squares further inside the picture.
  let solved: ReturnType<typeof solveCalibration> | null = null;
  let white: Pair = dark;
  let lastErr: unknown = null;
  for (const [inset, ms] of [[0.12, PATTERN_WAITS_MS[0]], [0.28, PATTERN_WAITS_MS[1]]] as const) {
    const centers = drawCalibrationPattern(stage.ctx, w, h, inset);
    await wait(ms);
    const lit = await grabAveraged(video);
    clearWhite(stage);
    await settle(video);
    white = await grabAveraged(video);
    try {
      // where things are: ordinary brightness (see grabFrame)
      lastCalibrationFrames = { dark: dark.luma, squares: lit.luma, white: white.luma };
      solved = solveCalibration(dark.luma, lit.luma, white.luma, centers, w, h);
      break;
    } catch (err) {
      lastErr = err;
      stage.ctx.setTransform(1, 0, 0, 1, 0, 0);
      stage.ctx.fillStyle = '#000';
      stage.ctx.fillRect(0, 0, w, h);
      await wait(400);
    }
  }
  if (!solved) throw lastErr;
  console.log('[shadow] calibrated using', solved.method);
  if (keep) return { ...keep, camToProj: solved.camToProj, projToCam: solved.projToCam, method: solved.method };
  return { camToProj: solved.camToProj, projToCam: solved.projToCam, whiteRef: white.luma, dark: dark.luma, method: solved.method };
}

const MIN_AGREEMENT = 0.75; // IoU between "where we think the picture is" and "what actually lit up"

/**
 * Work out camera -> projector mapping from the calibration frames, and refuse nonsense.
 * The whole projected picture (white minus dark) is a big, unmistakable bright area: any
 * mapping must agree with it. Uses the 4 squares if they agree, else the picture's corners.
 */
export function solveCalibration(dark: Gray, patternLit: Gray, white: Gray, centers: { x: number; y: number }[], projW: number, projH: number):
  { camToProj: H; projToCam: H; method: 'squares' | 'picture' } {
  const W = white.width, Hh = white.height, n = W * Hh;
  // the projected picture: what the projector brightened
  const diff = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) diff[i] = white.data[i] - dark.data[i];
  const sorted = Uint8ClampedArray.from(diff).sort();
  const thr = Math.max(15, 0.5 * sorted[Math.floor(n * 0.95)]);
  const bright: Mask = { width: W, height: Hh, data: new Uint8Array(n) };
  for (let i = 0; i < n; i++) bright.data[i] = diff[i] >= thr ? 1 : 0;
  const blob = findBlobs(bright, Math.floor(n * 0.02))[0];
  const markers = findMarkersDetailed(patternLit, dark);
  if (!blob) throw new CalibrationError(0, white, bright);
  const picture: Mask = { width: W, height: Hh, data: new Uint8Array(n) };
  for (const i of blob.pixels) picture.data[i] = 1;

  const agreement = (camToProj: H) => {
    const m = wallMask(camToProj, projW, projH, W, Hh);
    let inter = 0, uni = 0;
    for (let i = 0; i < n; i++) { inter += m.data[i] & picture.data[i]; uni += m.data[i] | picture.data[i]; }
    return uni ? inter / uni : 0;
  };
  const accept = (camToProj: H, method: 'squares' | 'picture') => ({ camToProj, projToCam: invertH(camToProj), method });

  if (markers.points) {
    // Squares: the bright picture must fall inside where they say the wall is (a stray light
    // taken for a square fails this), while a dim corner (lamp nearby) may stay unlit.
    // The camera also sees a glow around the bright picture (light bouncing off nearby surfaces,
    // the camera's own bloom), which can read as "picture" in a lamp-lit room: allow a margin
    // around the wall for it. A stray light taken for a square puts the wall far off, not a bit off.
    const h = solveHomography(markers.points, centers);
    const m = wallMask(h, projW, projH, W, Hh);
    let wall = 0;
    for (let i = 0; i < n; i++) wall += m.data[i];
    const near = dilate(m, Math.max(4, Math.round(0.1 * Math.sqrt(wall))));
    let inter = 0, interNear = 0, pic = 0;
    for (let i = 0; i < n; i++) { inter += m.data[i] & picture.data[i]; interNear += near.data[i] & picture.data[i]; pic += picture.data[i]; }
    if (pic && wall && interNear / pic >= 0.85 && inter / wall >= 0.55) return accept(h, 'squares');
    console.log(`[shadow] squares vs picture: ${Math.round((100 * interNear) / pic)}% of the bright picture near the wall (need 85), ${Math.round((100 * inter) / wall)}% of the wall bright (need 55)`);
  }
  // corners of the bright picture: only if the whole picture is in view (cut-off corners aren't corners)
  const t = blob.touches;
  if (t.left + t.right + t.up + t.down > 0) throw new CalibrationError(markers.seen, patternLit, markers.changed);
  // extremes along the diagonals
  let tl = 0, tr = 0, br = 0, bl = 0, vtl = Infinity, vtr = -Infinity, vbr = -Infinity, vbl = Infinity;
  for (const i of blob.pixels) {
    const x = i % W, y = (i / W) | 0;
    if (x + y < vtl) { vtl = x + y; tl = i; }
    if (x + y > vbr) { vbr = x + y; br = i; }
    if (x - y > vtr) { vtr = x - y; tr = i; }
    if (x - y < vbl) { vbl = x - y; bl = i; }
  }
  const at = (i: number, ox: number, oy: number) => ({ x: (i % W) + ox, y: ((i / W) | 0) + oy });
  const cam = [at(tl, 0, 0), at(tr, 1, 0), at(br, 1, 1), at(bl, 0, 1)];
  const h = solveHomography(cam, [{ x: 0, y: 0 }, { x: projW, y: 0 }, { x: projW, y: projH }, { x: 0, y: projH }]);
  if (agreement(h) >= MIN_AGREEMENT) return accept(h, 'picture');
  throw new CalibrationError(markers.seen, patternLit, markers.changed);
}

/**
 * After calibration: did someone stand in the light? Only wall spots that stayed DARK in the
 * white picture count (a person's shadow). A lamp-lit corner is bright, just not brightened much.
 */
export function calibrationWarning(wall: Mask, lit: Mask, white?: Gray): string | null {
  let w = 0;
  const litWhite: number[] = [];
  for (let i = 0; i < wall.data.length; i++) if (wall.data[i]) { w++; if (white && lit.data[i]) litWhite.push(white.data[i]); }
  if (!w) return null;
  litWhite.sort((a, b) => a - b);
  const typical = litWhite.length ? litWhite[litWhite.length >> 1] : 255;
  let blocked = 0;
  for (let i = 0; i < wall.data.length; i++) {
    if (!wall.data[i] || lit.data[i]) continue;
    if (!white || white.data[i] < 0.6 * typical) blocked++; // stayed dark: a shadow, not a lamp
  }
  return blocked / w > 0.1 ? 'part of the wall stayed dark while calibrating (someone in the light?) — step out of the light and press C' : null;
}
