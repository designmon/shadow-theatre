import { grabGray } from '../camera';
import type { Stage } from '../stage';
import { clearWhite } from '../stage';
import type { Gray, H } from '../types';
import { invertH, solveHomography } from './homography';
import type { Mask } from '../types';
import { drawCalibrationPattern, findMarkersDetailed } from './pattern';

export type Calibration = { camToProj: H; projToCam: H; whiteRef: Gray; dark: Gray };

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
  if (!cam) {
    clearWhite(stage);
    throw new CalibrationError(result!.seen, lit, result!.changed);
  }
  const camToProj = solveHomography(cam, centers);
  clearWhite(stage);
  if (keep) return { ...keep, camToProj, projToCam: invertH(camToProj) };
  await settle(video);
  const whiteRef = await grabAveraged(video);
  return { camToProj, projToCam: invertH(camToProj), whiteRef, dark };
}
