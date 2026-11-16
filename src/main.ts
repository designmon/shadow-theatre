import { runCalibration, type Calibration } from './calibration/calibrate';
import { grabGray, startCamera } from './camera';
import { drawDebug } from './debug/overlay';
import { Recorder } from './debug/recorder';
import { clearWhite, createStage } from './stage';
import { buildExpected, shadowMask } from './vision/shadowMask';
import type { Mask } from './types';

const stage = createStage();
const recorder = new Recorder();
let debug = true;
let calib: Calibration | null = null;
let calibrating = false;
let status = 'not calibrated (press C)';

async function main() {
  const { video, stream } = await startCamera();

  const calibrate = async () => {
    if (calibrating) return;
    calibrating = true;
    try {
      calib = await runCalibration(stage, video);
      status = 'calibrated';
    } catch (err) {
      status = String((err as Error).message ?? err);
    } finally {
      calibrating = false;
    }
  };

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') document.documentElement.requestFullscreen?.();
    if (k === 'd') debug = !debug;
    if (k === 'r') recorder.toggle(stream);
    if (k === 'c') calibrate();
  });
  setTimeout(calibrate, 800);

  let last = performance.now();
  let fps = 0;
  const tick = () => {
    const now = performance.now();
    fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1;
    last = now;
    if (calibrating) return requestAnimationFrame(tick);
    const frame = grabGray(video);
    const noDark: Mask = { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) };
    const mask = shadowMask(frame, calib ? buildExpected(calib.whiteRef, noDark) : null);
    clearWhite(stage);
    if (debug) drawDebug(stage.ctx, { frame, mask, fps, lines: [status, ...(recorder.recording ? ['● REC'] : [])] });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});
