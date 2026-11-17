import { CalibrationError, calibrationWarning, runCalibration, type Calibration } from './calibration/calibrate';
import { alignmentScore } from './calibration/alignment';
import { wallMask, warpMask } from './calibration/homography';
import { debounce, MisalignmentWatch } from './calibration/watch';
import { grabGray, listCameras, saveCameraId, savedCameraId, startCamera } from './camera';
import { Checklist, describeHealth, type Health } from './setup/checklist';
import { SetupPanel } from './setup/panel';
import { PeelOff } from './creatures/peel';
import type { Creature } from './creatures/types';
import { drawDebug } from './debug/overlay';
import { Recorder } from './debug/recorder';
import { clearWhite, createStage } from './stage';
import type { Gray, Mask } from './types';
import { findBlobs } from './vision/blobs';
import { HoldDetector } from './vision/hold';
import { projectBox, projectMask } from './vision/project';
import { analyzeScene, isUsablePuppet, sceneLit, usableReason, type Scene } from './vision/scene';
import { setBlur } from './creatures/style';
import { buildExpected, dilate, erode, keepInside, litMask, shadowMask, smoothMask, wallInterior } from './vision/shadowMask';
import { installSimCamera } from './sim';
import { recognize } from './recognize/client';
import { maskToPng, snapshotRegion } from './vision/snapshot';

const stage = createStage();
if (new URLSearchParams(location.search).has('sim')) installSimCamera(() => stage.canvas);
const recorder = new Recorder();
const hold = new HoldDetector({ cooldownMs: 3000 });
const creatures: Creature[] = [];
let debug = false; // the setup panel covers first-run checks; D shows the small debug view
let calib: Calibration | null = null;
let lit: Mask | null = null;
let calibrating = false;
let status = 'not calibrated (press C)';
let lastRec = '—';
const watch = new MisalignmentWatch();
const STEADY_MS = 300; // only check creatures that have been fully opaque this long (camera/projector lag)
let darkPx = 0;
let whyIgnored: string | null = null;
let calibInfo = '';
let shadowInfo = '';
const countOnes = (m: Mask) => { let n = 0; for (const v of m.data) n += v; return n; };
const checklist = new Checklist();
let panel: SetupPanel | null = null;

const DARK_SCALE = 0.25; // render creatures at quarter size to find what we actually darken
let darkCanvas: OffscreenCanvas | null = null;

/** What we actually project dark (creatures as drawn, plus the debug overlay), in camera space. */
function projectedDarkInCamera(frame: Gray, withOverlay = true, steadyOnly = false): Mask {
  const { w, h } = stage.size();
  const dw = Math.ceil(w * DARK_SCALE), dh = Math.ceil(h * DARK_SCALE);
  if (!darkCanvas || darkCanvas.width !== dw || darkCanvas.height !== dh) darkCanvas = new OffscreenCanvas(dw, dh);
  const dctx = darkCanvas.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dw, dh);
  dctx.setTransform(DARK_SCALE, 0, 0, DARK_SCALE, 0, 0);
  setBlur(false); // the mask pass doesn't need the soft edge (and blur is slow)
  for (const c of creatures) if (!steadyOnly || (c.steadyMs ?? 0) >= STEADY_MS) c.draw(dctx);
  setBlur(true);
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  const rgba = dctx.getImageData(0, 0, dw, dh).data;
  const small: Mask = { width: dw, height: dh, data: new Uint8Array(dw * dh) };
  for (let i = 0; i < small.data.length; i++) small.data[i] = rgba[i * 4 + 3] > 128 ? 1 : 0;
  if (withOverlay) {
    // the debug picture-in-picture and the setup panel are projected too: don't mistake them for shadows
    const rects = [];
    if (debug) rects.push({ x: 0, y: 0, w: w * 0.18 + 40, h: w * 0.18 * 0.75 + 140 });
    const pr = panel?.rect();
    if (pr) rects.push({ x: pr.x - 20, y: pr.y - 20, w: pr.w + 40, h: pr.h + 40 });
    for (const r of rects) {
      const x0 = Math.max(0, Math.floor(r.x * DARK_SCALE)), x1 = Math.min(dw, Math.ceil((r.x + r.w) * DARK_SCALE));
      const y0 = Math.max(0, Math.floor(r.y * DARK_SCALE)), y1 = Math.min(dh, Math.ceil((r.y + r.h) * DARK_SCALE));
      for (let y = y0; y < y1; y++) small.data.fill(1, y * dw + x0, y * dw + Math.max(x0, x1));
    }
  }
  const H = calib!.camToProj.map((v, i) => (i < 6 ? v * DARK_SCALE : v)); // camera px -> small px
  const cam = warpMask(small, H, frame.width, frame.height);
  return withOverlay ? dilate(cam, 2) : cam; // dilate for masking (blur halo), exact for the alignment check
}

let lastCapUrl: string | null = null;
/** Debug: the last cut-out sent to Claude and its answer (bottom-right, with D). */
function showLastCapture(png: Blob, verdict: string): void {
  if (lastCapUrl) URL.revokeObjectURL(lastCapUrl);
  lastCapUrl = URL.createObjectURL(png);
  const box = document.getElementById('lastcap')!;
  box.querySelector('img')!.src = lastCapUrl;
  box.querySelector('b')!.textContent = verdict;
  box.style.display = debug ? 'block' : 'none';
}

const SNAP_PAD = 12; // same pad as maskToPng uses

function spawnPeel(scene: Scene): PeelOff {
  const c = calib!;
  const pb = scene.puppetBox;
  const snap = snapshotRegion(pb, SNAP_PAD); // the square image sent for recognition (head position is relative to it)
  const raw = projectMask(scene.puppet, scene.puppetBox, c.camToProj, c.projToCam);
  // each camera pixel became a block of ~scale x scale on the wall: smooth those steps away
  const scale = raw.box.w / Math.max(1, scene.puppetBox.w);
  const shape = { box: raw.box, mask: smoothMask(raw.mask, Math.round(scale * 0.6)) };
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
  let cam = await startCamera(savedCameraId());
  let { video, stream } = cam;
  panel = new SetupPanel(async (id) => {
    stream.getTracks().forEach((t) => t.stop());
    cam = await startCamera(id);
    ({ video, stream } = cam);
    saveCameraId(id);
    checklist.camera('ok', cam.label, performance.now());
    calibrate(); // a different camera sees the wall differently
  });
  checklist.camera('ok', cam.label);
  panel.setCameras(await listCameras(), cam.label);

  // is the recognition server up and does Claude accept the key?
  const checkServer = async () => {
    let h: Health | null = null;
    try {
      const res = await fetch('/api/health');
      h = res.ok ? ((await res.json()) as Health) : null;
    } catch { /* server down */ }
    const [state, detail] = describeHealth(h);
    checklist.server(state, detail, performance.now());
    setTimeout(checkServer, state === 'ok' ? 30000 : 4000);
  };
  checkServer();

  const calibrate = async (auto = false) => {
    if (calibrating) return;
    calibrating = true;
    const panelWasVisible = panel!.visible;
    panel!.show(false); // the calibration pattern must not be covered
    checklist.wall('pending', 'calibrating — stay out of the beam…');
    panel!.hideCalibrationView();
    try {
      // automatic re-alignment: the performer is probably in the beam, so keep the reference frames
      calib = await runCalibration(stage, video, auto && calib ? calib : undefined);
      // only the projected picture counts as wall: never the room around it
      const wall = wallMask(calib.camToProj, stage.size().w, stage.size().h, calib.whiteRef.width, calib.whiteRef.height);
      lit = litMask(calib.whiteRef, calib.dark);
      const blocked = calibrationWarning(wall, lit, calib.whiteRef);
      const litBefore = countOnes(lit);
      for (let i = 0; i < lit.data.length; i++) lit.data[i] &= wall.data[i];
      lit = wallInterior(lit, 3); // the border between picture and bare wall is not a shadow
      // diagnostics for the debug view: what the calibration thinks the wall is
      const n = lit.data.length, med = (g: Gray) => { const v: number[] = []; for (let i = 0; i < n; i += 5) if (lit!.data[i]) v.push(g.data[i]); v.sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 0; };
      calibInfo = `wall ${Math.round((100 * countOnes(wall)) / n)}% of view · lit ${Math.round((100 * litBefore) / n)}% → ${Math.round((100 * countOnes(lit)) / n)}% · white ${med(calib.whiteRef)} / black ${med(calib.dark)}`;
      console.log('[shadow] calibration', calibInfo);
      status = auto ? 're-aligned' : 'calibrated';
      checklist.wall('ok', auto ? 're-aligned after the projector moved' : calib.method === 'picture' ? 'projector found — from the bright picture' : 'projector found — 4 squares seen', performance.now());
      if (blocked && !auto) { checklist.wall('fail', blocked, performance.now()); status = blocked; }
      hold.reset();
    } catch (err) {
      status = auto ? 'projector moved? step out of the beam and press C' : String((err as Error).message ?? err);
      const why = err instanceof CalibrationError ? err.message : String((err as Error).message ?? err);
      checklist.wall('fail', auto ? 'projector moved — step out of the beam, press C' : `${why} — then press C`, performance.now());
      if (err instanceof CalibrationError) panel!.showCalibrationView(err.seen, err.lit, err.changed);
      if (auto) watch.failed(performance.now());
      if (!auto) panel!.show(true); // bring the help back on failure
    } finally {
      calibrating = false;
      if (panelWasVisible && !panel!.visible && !checklist.ready) panel!.show(true);
    }
  };
  // fullscreen / window changes alter the stage size: the old mapping is stale
  const recalibrateSoon = debounce(() => calibrate(), 800);
  window.addEventListener('resize', recalibrateSoon);
  document.addEventListener('fullscreenchange', recalibrateSoon);

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'f') document.documentElement.requestFullscreen?.();
    if (k === 'd') { debug = !debug; document.getElementById('lastcap')!.style.display = debug && lastCapUrl ? 'block' : 'none'; }
    if (k === 'r') recorder.toggle(stream);
    if (k === 'c') calibrate();
    if (k === 's') panel!.show(!panel!.visible);
  });
  // Calibrate once the page is fullscreen on the projector (fullscreenchange triggers it); C forces it.
  checklist.wall('pending', 'drag this window onto the projector screen, click it, press F');
  if (document.fullscreenElement || new URLSearchParams(location.search).has('sim')) setTimeout(calibrate, 800);

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
      mask = shadowMask(frame, buildExpected(calib.whiteRef, dark), 0.45, calib.dark);
      const rawPx = countOnes(mask);
      if (lit) mask = keepInside(mask, lit); // shadows only count on the projected picture
      shadowInfo = `shadow px: ${rawPx} seen → ${countOnes(mask)} on wall · ${findBlobs(mask).length} shape(s)`;
      // self-healing: if our creatures stop showing up where we project them, the projector moved
      const own = creatures.length ? projectedDarkInCamera(frame, false) : null;
      const steady = creatures.length ? erode(projectedDarkInCamera(frame, false, true), 2) : null;
      const score = steady && countOnes(steady) >= 1000 ? alignmentScore(frame, calib.whiteRef, steady, calib.dark) : null;
      if (watch.push(score, now)) { status = 'projector moved — re-aligning'; calibrate(true); return; }
      scene = analyzeScene(mask, findBlobs(mask), lit ? sceneLit(lit, dark) : undefined);
      if (scene) checklist.shadow('ok', 'seen — make a shape and hold it still', now);
      if (scene && lit) whyIgnored = usableReason(scene, own ?? { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, lit);
      const usable = scene && lit && isUsablePuppet(scene, own ?? { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, lit);
      if (scene && usable && hold.push(scene.puppet, now)) {
        const peel = spawnPeel(scene);
        console.log('[shadow] captured', JSON.stringify({ entry: scene.entry, openSide: scene.openSide, puppetBox: scene.puppetBox, bodyBox: scene.bodyBox, neck: scene.neck }));
        maskToPng(scene.puppet, scene.puppetBox, SNAP_PAD).then((png) => {
          showLastCapture(png, 'asking Claude…');
          return recognize(png).then((rec) => {
            lastRec = `${rec.kind} (${rec.confidence.toFixed(2)})`;
            showLastCapture(png, `→ ${lastRec}${rec.note ? ` — ${rec.note}` : ''}`);
            console.log('[shadow] sent shape, Claude said', rec);
            peel.resolve(rec);
          });
        });
      }
      if (!scene) hold.reset();
    } else {
      mask = shadowMask(frame, null);
    }

    if (scene && calib) {
      const hand = projectBox(scene.puppetBox, calib.camToProj);
      for (const c of creatures) if (c instanceof PeelOff) c.avoid(hand);
    }
    for (const c of creatures) c.update(dt);
    for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].done) creatures.splice(i, 1);

    if (panel!.visible) {
      panel!.render(checklist);
      // until calibrated it can't tell wall from room, so show the plain camera picture
      panel!.drawCamera(frame, calib ? mask : { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) });
      if (checklist.shouldAutoHide(now)) panel!.show(false);
    }

    clearWhite(stage);
    for (const c of creatures) c.draw(stage.ctx);
    if (debug) {
      const lines = [status, scene ? `shadow from ${scene.entry ?? 'nowhere'} → open ${scene.openSide}` : 'no shadow', `${creatures.length} creature(s)`, `last seen: ${lastRec}`, `ignoring ${darkPx} px`, calibInfo, shadowInfo, scene ? `shape: ${whyIgnored ?? 'usable ✓'}` : ''];
      if (recorder.recording) lines.push('● REC');
      // before calibration it can't tell wall from room: don't paint the room red
      drawDebug(stage.ctx, { frame, mask: calib ? mask : { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, fps, lines, puppetBox: scene?.puppetBox ?? null });
    }
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});
