import { runCalibration, type Calibration } from './calibration/calibrate';
import { warpMask } from './calibration/homography';
import { grabGray, startCamera } from './camera';
import { PeelOff } from './creatures/peel';
import type { Creature } from './creatures/types';
import { drawDebug } from './debug/overlay';
import { Recorder } from './debug/recorder';
import { clearWhite, createStage } from './stage';
import type { Gray, Mask } from './types';
import { findBlobs } from './vision/blobs';
import { HoldDetector } from './vision/hold';
import { projectBox, projectMask } from './vision/project';
import { analyzeScene, type Scene } from './vision/scene';
import { buildExpected, litMask, shadowMask } from './vision/shadowMask';
import { installSimCamera } from './sim';
import { recognize } from './recognize/client';
import { maskToPng } from './vision/snapshot';

const stage = createStage();
if (new URLSearchParams(location.search).has('sim')) installSimCamera(() => stage.canvas);
const recorder = new Recorder();
const hold = new HoldDetector();
const creatures: Creature[] = [];
let debug = true;
let calib: Calibration | null = null;
let lit: Mask | null = null;
let calibrating = false;
let status = 'not calibrated (press C)';
let lastRec = '—';

/** Union of what all creatures darken, mapped into camera space. */
function projectedDarkInCamera(frame: Gray): Mask {
  const { w, h } = stage.size();
  const union: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
  for (const c of creatures) {
    const m = c.darkMask(w, h);
    for (let i = 0; i < m.data.length; i++) union.data[i] |= m.data[i];
  }
  if (debug) {
    // the debug picture-in-picture is projected too: don't mistake it for a shadow
    const ow = Math.ceil(w * 0.18) + 40, oh = Math.ceil(w * 0.18 * 0.75) + 140;
    for (let y = 0; y < Math.min(h, oh); y++) union.data.fill(1, y * w, y * w + Math.min(w, ow));
  }
  return warpMask(union, calib!.camToProj, frame.width, frame.height);
}

function spawnPeel(scene: Scene): PeelOff {
  const c = calib!;
  const shape = projectMask(scene.puppet, scene.puppetBox, c.camToProj, c.projToCam);
  const { w, h } = stage.size();
  const peel = new PeelOff(shape, {
    anchorBox: shape.box,
    facing: scene.openSide,
    openSide: scene.openSide,
    wall: { w, h },
    avoid: scene.bodyBox ? projectBox(scene.bodyBox, c.camToProj) : null,
  });
  creatures.push(peel);
  return peel;
}

async function main() {
  const { video, stream } = await startCamera();

  const calibrate = async () => {
    if (calibrating) return;
    calibrating = true;
    try {
      calib = await runCalibration(stage, video);
      lit = litMask(calib.whiteRef);
      status = 'calibrated';
      hold.reset();
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
    requestAnimationFrame(tick);
    if (calibrating) return;
    const now = performance.now();
    const dt = Math.min(100, now - last);
    fps = fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1;
    last = now;

    const frame = grabGray(video);
    let mask: Mask;
    let scene: Scene | null = null;
    if (calib) {
      mask = shadowMask(frame, buildExpected(calib.whiteRef, projectedDarkInCamera(frame)));
      scene = analyzeScene(mask, findBlobs(mask), lit ?? undefined);
      if (scene && hold.push(scene.puppet, now)) {
        const peel = spawnPeel(scene);
        maskToPng(scene.puppet, scene.puppetBox).then(recognize).then((rec) => {
          lastRec = `${rec.kind} (${rec.confidence.toFixed(2)})`;
          peel.resolve(rec);
        });
      }
      if (!scene) hold.reset();
    } else {
      mask = shadowMask(frame, null);
    }

    for (const c of creatures) c.update(dt);
    for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].done) creatures.splice(i, 1);

    clearWhite(stage);
    for (const c of creatures) c.draw(stage.ctx);
    if (debug) {
      const lines = [status, scene ? `shadow from ${scene.entry ?? 'nowhere'} → open ${scene.openSide}` : 'no shadow', `${creatures.length} creature(s)`, `last seen: ${lastRec}`];
      if (recorder.recording) lines.push('● REC');
      drawDebug(stage.ctx, { frame, mask, fps, lines });
    }
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});
