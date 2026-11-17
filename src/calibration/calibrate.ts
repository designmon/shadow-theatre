import { grabGray } from '../camera';
import type { Stage } from '../stage';
import { clearWhite } from '../stage';
import type { Gray, H } from '../types';
import { invertH, solveHomography, wallMask } from './homography';
import { findBlobs } from '../vision/blobs';
import type { Mask } from '../types';
import { drawCalibrationPattern, findMarkersDetailed } from './pattern';

export type Calibration = { camToProj: H; projToCam: H; whiteRef: Gray; dark: Gray; method?: 'squares' | 'picture' };

/** Calibration failed: carries what the camera saw, for the setup card. */
export class CalibrationError extends Error {
  constructor(readonly seen: number, readonly lit: Gray, readonly changed: Mask) {
    super(seen === 0
      ? "can't see the projected squares at all — is the camera pointing at the projected picture?"
      : `only saw ${seen} of the 4 squares — make sure the whole picture is in view and nothing blocks the light`);
  }
}

// The projector (keystone processing) and webcam both lag; wait longer on the retry.
const PATTERN_WAITS_MS = [900, 1600];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Average several frames to suppress projector (DLP) flicker. */
async function grabAveraged(video: HTMLVideoElement, n = 5): Promise<Gray> {
  const frames: Gray[] = [];
  for (let i = 0; i < n; i++) {
    frames.push(grabGray(video));
    await wait(40);
  }
  const { width, height } = frames[0];
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i++) {
    let s = 0;
    for (const f of frames) s += f.data[i];
    data[i] = s / n;
  }
  return { width, height, data };
}

/** Wait (up to 2 s) until the webcam's auto-exposure has stopped changing the picture. */
async function settle(video: HTMLVideoElement): Promise<void> {
  const mean = () => { const g = grabGray(video, 80, 60); let s = 0; for (const v of g.data) s += v; return s / g.data.length; };
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
  const centers = drawCalibrationPattern(stage.ctx, w, h);
  let cam = null, lit: Gray = dark, result = null;
  for (const ms of PATTERN_WAITS_MS) {
    await wait(ms);
    lit = await grabAveraged(video);
    result = findMarkersDetailed(lit, dark);
    if ((cam = result.points)) break;
  }
  void cam;
  clearWhite(stage);
  await settle(video);
  const whiteRef = await grabAveraged(video);
  const solved = solveCalibration(dark, lit, whiteRef, centers, w, h); // throws CalibrationError if it doesn't add up
  console.log('[shadow] calibrated using', solved.method);
  if (keep) return { ...keep, camToProj: solved.camToProj, projToCam: solved.projToCam, method: solved.method };
  return { camToProj: solved.camToProj, projToCam: solved.projToCam, whiteRef, dark, method: solved.method };
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
    const h = solveHomography(markers.points, centers);
    if (agreement(h) >= MIN_AGREEMENT) return accept(h, 'squares');
  }
  // corners of the bright picture: extremes along the diagonals
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
