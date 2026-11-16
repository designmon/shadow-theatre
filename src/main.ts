import { grabGray, startCamera } from './camera';
import { drawDebug } from './debug/overlay';
import { Recorder } from './debug/recorder';
import { clearWhite, createStage } from './stage';
import { shadowMask } from './vision/shadowMask';

const stage = createStage();
const recorder = new Recorder();
let debug = true;

async function main() {
  const { video, stream } = await startCamera();

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') document.documentElement.requestFullscreen?.();
    if (k === 'd') debug = !debug;
    if (k === 'r') recorder.toggle(stream);
  });

  let last = performance.now();
  let fps = 0;
  const tick = () => {
    const now = performance.now();
    fps = fps * 0.9 + (1000 / Math.max(1, now - last)) * 0.1;
    last = now;
    const frame = grabGray(video);
    const mask = shadowMask(frame, null);
    clearWhite(stage);
    if (debug) drawDebug(stage.ctx, { frame, mask, fps, lines: recorder.recording ? ['● REC'] : [] });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});
