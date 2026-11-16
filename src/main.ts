import { runCalibration, type Calibration } from './calibration/calibrate';
import { alignmentScore } from './calibration/alignment';
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
import { analyzeScene, isUsablePuppet, type Scene } from './vision/scene';
import { setBlur } from './creatures/style';
import { buildExpected, dilate, litMask, shadowMask } from './vision/shadowMask';
import { installSimCamera } from './sim';
import { recognize } from './recognize/client';
import { maskToPng } from './vision/snapshot';

const stage = createStage();
if (new URLSearchParams(location.search).has('sim')) installSimCamera(() => stage.canvas);
const recorder = new Recorder();
const hold = new HoldDetector({ cooldownMs: 3000 });
const creatures: Creature[] = [];
let debug = true;
let calib: Calibration | null = null;
let lit: Mask | null = null;
let calibrating = false;
let status = 'not calibrated (press C)';
let lastRec = '—';
let misaligned = 0;
let darkPx = 0;
const countOnes = (m: Mask) => { let n = 0; for (const v of m.data) n += v; return n; };

const DARK_SCALE = 0.25; // render creatures at quarter size to find what we actually darken
let darkCanvas: OffscreenCanvas | null = null;

/** What we actually project dark (creatures as drawn, plus the debug overlay), in camera space. */
function projectedDarkInCamera(frame: Gray, withOverlay = true): Mask {
  const { w, h } = stage.size();
  const dw = Math.ceil(w * DARK_SCALE), dh = Math.ceil(h * DARK_SCALE);
  if (!darkCanvas || darkCanvas.width !== dw || darkCanvas.height !== dh) darkCanvas = new OffscreenCanvas(dw, dh);
  const dctx = darkCanvas.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dw, dh);
  dctx.setTransform(DARK_SCALE, 0, 0, DARK_SCALE, 0, 0);
  setBlur(false); // the mask pass doesn't need the soft edge (and blur is slow)
  for (const c of creatures) c.draw(dctx);
  setBlur(true);
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  const rgba = dctx.getImageData(0, 0, dw, dh).data;
  const small: Mask = { width: dw, height: dh, data: new Uint8Array(dw * dh) };
  for (let i = 0; i < small.data.length; i++) small.data[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  if (debug && withOverlay) {
    // the debug picture-in-picture is projected too: don't mistake it for a shadow
    const ow = Math.ceil((w * 0.18 + 40) * DARK_SCALE), oh = Math.ceil((w * 0.18 * 0.75 + 140) * DARK_SCALE);
    for (let y = 0; y < Math.min(dh, oh); y++) small.data.fill(1, y * dw, y * dw + Math.min(dw, ow));
  }
  const H = calib!.camToProj.map((v, i) => (i < 6 ? v * DARK_SCALE : v)); // camera px -> small px
  const cam = warpMask(small, H, frame.width, frame.height);
  return withOverlay ? dilate(cam, 2) : cam; // dilate for masking (blur halo), exact for the alignment check
}

const SNAP_PAD = 12; // must match maskToPng's default pad

function spawnPeel(scene: Scene): PeelOff {
  const c = calib!;
  const pb = scene.puppetBox;
  const snap = { x: Math.max(0, pb.x - SNAP_PAD), y: Math.max(0, pb.y - SNAP_PAD), w: 0, h: 0 };
  snap.w = Math.min(scene.puppet.width, pb.x + pb.w + SNAP_PAD) - snap.x;
  snap.h = Math.min(scene.puppet.height, pb.y + pb.h + SNAP_PAD) - snap.y;
  const shape = projectMask(scene.puppet, scene.puppetBox, c.camToProj, c.projToCam);
  const { w, h } = stage.size();
  const peel = new PeelOff(shape, {
    anchorBox: shape.box,
    facing: scene.openSide,
    openSide: scene.openSide,
    wall: { w, h },
    avoid: scene.bodyBox ? projectBox(scene.bodyBox, c.camToProj) : null,
  }, projectBox(snap, c.camToProj));
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
      const dark = projectedDarkInCamera(frame);
      darkPx = countOnes(dark);
      mask = shadowMask(frame, buildExpected(calib.whiteRef, dark));
      // self-healing: if our creatures stop showing up where we project them, the projector moved
      const own = creatures.length ? projectedDarkInCamera(frame, false) : null;
      if (own && countOnes(own) >= 1500) {
        misaligned = alignmentScore(frame, calib.whiteRef, own) < 0.5 ? misaligned + 1 : 0;
        if (misaligned >= 15) { misaligned = 0; status = 'projector moved — recalibrating'; calibrate(); return; }
      } else misaligned = 0;
      scene = analyzeScene(mask, findBlobs(mask), lit ?? undefined);
      const usable = scene && lit && isUsablePuppet(scene, own ?? { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, lit);
      if (scene && usable && hold.push(scene.puppet, now)) {
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
      const lines = [status, scene ? `shadow from ${scene.entry ?? 'nowhere'} → open ${scene.openSide}` : 'no shadow', `${creatures.length} creature(s)`, `last seen: ${lastRec}`, `ignoring ${darkPx} px`];
      if (recorder.recording) lines.push('● REC');
      drawDebug(stage.ctx, { frame, mask, fps, lines });
    }
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});
