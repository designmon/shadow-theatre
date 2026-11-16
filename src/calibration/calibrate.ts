import { grabGray } from '../camera';
import type { Stage } from '../stage';
import { clearWhite } from '../stage';
import type { Gray, H } from '../types';
import { invertH, solveHomography } from './homography';
import { drawCalibrationPattern, findMarkers } from './pattern';

export type Calibration = { camToProj: H; projToCam: H; whiteRef: Gray };

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

export async function runCalibration(stage: Stage, video: HTMLVideoElement): Promise<Calibration> {
  const { w, h } = stage.size();
  stage.ctx.setTransform(1, 0, 0, 1, 0, 0);
  stage.ctx.fillStyle = '#000';
  stage.ctx.fillRect(0, 0, w, h);
  await wait(400);
  const dark = await grabAveraged(video);
  const centers = drawCalibrationPattern(stage.ctx, w, h);
  await wait(400);
  const lit = await grabAveraged(video);
  const cam = findMarkers(lit, dark);
  if (!cam) throw new Error('Could not see the 4 calibration squares — is the whole wall in the camera view?');
  clearWhite(stage);
  await wait(400);
  const whiteRef = await grabAveraged(video);
  const camToProj = solveHomography(cam, centers);
  return { camToProj, projToCam: invertH(camToProj), whiteRef };
}
