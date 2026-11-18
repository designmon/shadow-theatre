import { CalibrationError, calibrationWarning, lastCalibrationFrames, runCalibration, type Calibration } from './calibration/calibrate';
import { alignmentScore } from './calibration/alignment';
import { wallMask, warpMask } from './calibration/homography';
import { debounce, MisalignmentWatch } from './calibration/watch';
import { grabFrame, listCameras, saveCameraId, savedCameraId, startCamera } from './camera';
import { litFrame } from './vision/light';
import { exportDrawing, exportScene } from './runway/export';
import { ClipPlayer, watchClips, type ClipEvent } from './runway/clips';
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
import { bridgeOwnInk, dilate, erode, keepInside, litMask, minFilter, ownInk, shadowMask, smoothMask, wallInterior } from './vision/shadowMask';
import { installSimCamera } from './sim';
import { recognize } from './recognize/client';
import { maskToPng, snapshotRegion } from './vision/snapshot';
import { LaserPen, type PenState } from './draw/pen';
import { Doodle, motionFor, type Motion } from './draw/doodle';
import { accentAt, doodleToPng, drawPen, INK_COLOR } from './draw/render';
import { Sparkles } from './draw/sparkles';
import { applyH } from './calibration/homography';

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
const MAX_CREATURES = 8;
const pen = new LaserPen();
const sparkles = new Sparkles();
/** Shadow-puppet recognition (hold a hand shape -> animal). Off while the fingertip pen is the focus. */
const PUPPETS = false;
let penState: PenState = { mode: 'idle', arm: 0, cursor: null, strokes: [] };
const ROW_SLOTS = 9; // drawings rest in a row along the bottom of the wall
let hovered: { d: Doodle; since: number; seen: number } | null = null;
let rawTip: { x: number; y: number } | null = null; // where the camera sees the fingertip this frame (debug: a small +) // a resting drawing the fingertip points at
const WAKE_DWELL_MS = 500;
let lastPointingAt = -Infinity;
const POINTING_QUIET_MS = 1500; // a finger seen pointing recently is a pen, never a puppet

/** The row along the bottom where drawings rest: the next free place (the oldest makes room). */
function restingPlace(d: Doodle): { at: { x: number; y: number }; scale: number } {
  const { w, h } = stage.size();
  const doodles = creatures.filter((c): c is Doodle => c instanceof Doodle && !c.retiring);
  if (doodles.length > ROW_SLOTS) doodles[0].retire();
  const index = (doodles.indexOf(d) + Math.max(0, doodles.length - ROW_SLOTS)) % ROW_SLOTS;
  const slotW = w / ROW_SLOTS;
  return { at: { x: w - slotW * (index + 0.5), y: h - Math.min(h * 0.11, slotW * 0.45) }, scale: Math.min(0.5, (slotW * 0.7) / d.drawnSize) };
}

/** A finished fingertip drawing: appears as drawn, refines, is recognised and comes alive. */
function bringDrawingToLife(strokes: { x: number; y: number }[][]): void {
  const { w, h } = stage.size();
  const doodle = new Doodle(strokes, { w, h });
  creatures.push(doodle);
  const place = restingPlace(doodle);
  doodle.park(place.at, place.scale);
  doodleToPng(strokes)
    .then((png) => fetch('/api/doodle', { method: 'POST', body: png, headers: { 'content-type': 'image/png' } }))
    .then((r) => (r.ok ? r.json() : { what: 'something', motion: 'float', confidence: 0 }))
    .catch(() => ({ what: 'something', motion: 'float', confidence: 0 }))
    .then((rec: { what: string; motion: Motion; confidence: number; note?: string }) => {
      const motion = motionFor(rec.what, rec.motion);
      lastRec = `drawing: ${rec.what} → ${motion}${rec.note ? ' — ' + rec.note : ''}`;
      doodle.comeAlive(motion, rec.what); // your own line, refined, with the motion that fits it
      // also save it for Runway (captures/runway-in/<id>.png + prompt), once the clean drawing is in
      setTimeout(() => void exportDrawing(doodle).then((id) => { if (id) matchClips(doodle); }), 1600);
    });
}

// ---- Runway, phase 1: clips dropped into captures/runway-out/ come back onto the wall ----
const clipEvents: ClipEvent[] = [];
let latestScene: ClipEvent | null = null;
let wallClip: { player: ClipPlayer; at: number } | null = null; // a scene clip playing over the whole wall
let note: { text: string; at: number } | null = null; // a short line on the wall
const say = (text: string) => { note = { text, at: performance.now() }; };
const doodles = () => creatures.filter((c): c is Doodle => c instanceof Doodle);
function matchClips(d: Doodle): void {
  const e = [...clipEvents].reverse().find((x) => d.id && x.file.includes(d.id));
  if (e && !d.hasClip) { d.attachClip(new ClipPlayer(e.url)); say(`Runway clip ready — point at the ${d.what || 'drawing'}`); }
}
watchClips((e) => {
  clipEvents.push(e);
  if (e.file.startsWith('scene-')) {
    latestScene = e;
    if (!e.initial) playScene(e); // a new scene clip: play it once across the wall (V plays it again)
    return;
  }
  const d = doodles().find((x) => x.id && e.file.includes(x.id));
  if (d) { d.attachClip(new ClipPlayer(e.url)); say(`Runway clip ready — point at the ${d.what || 'drawing'}`); }
});
function playScene(e: ClipEvent): void {
  const player = new ClipPlayer(e.url);
  player.start();
  wallClip = { player, at: performance.now() };
}
const SCENE_FADE_MS = 700;
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
function projectedDarkInCamera(frame: Gray, withOverlay = true, steadyOnly = false, withCreatures = true): Mask {
  const { w, h } = stage.size();
  const dw = Math.ceil(w * DARK_SCALE), dh = Math.ceil(h * DARK_SCALE);
  if (!darkCanvas || darkCanvas.width !== dw || darkCanvas.height !== dh) darkCanvas = new OffscreenCanvas(dw, dh);
  const dctx = darkCanvas.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dw, dh);
  dctx.setTransform(DARK_SCALE, 0, 0, DARK_SCALE, 0, 0);
  setBlur(false); // the mask pass doesn't need the soft edge (and blur is slow)
  if (withCreatures) for (const c of creatures) if (!steadyOnly || (c.steadyMs ?? 0) >= STEADY_MS) c.draw(dctx);
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

/**
 * How bright we project each camera pixel right now (0 = black, 255 = white): the stage picture
 * itself, so drawings, black ink, the coloured pen line and sparkles are all expected. Panels on
 * the wall count as dark (ignored). Spread by 2 px toward the darker, for small misalignment.
 */
let projCanvas: OffscreenCanvas | null = null;
function projectedInCamera(frame: Gray): Gray {
  const { w, h } = stage.size();
  const dw = Math.ceil(w * DARK_SCALE), dh = Math.ceil(h * DARK_SCALE);
  if (!projCanvas || projCanvas.width !== dw || projCanvas.height !== dh) projCanvas = new OffscreenCanvas(dw, dh);
  const pctx = projCanvas.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, dw, dh);
  pctx.drawImage(stage.canvas, 0, 0, dw, dh);
  const rgba = pctx.getImageData(0, 0, dw, dh).data;
  const small = new Uint8Array(dw * dh);
  // judged like the camera picture (vision/light.ts): the most-lit colour channel — our blue ink is "lit", black is dark
  for (let i = 0; i < small.length; i++) small[i] = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  const rects = [];
  if (debug) rects.push({ x: 0, y: 0, w: w * 0.18 + 40, h: w * 0.18 * 0.75 + 140 });
  const pr = panel?.rect();
  if (pr) rects.push({ x: pr.x - 20, y: pr.y - 20, w: pr.w + 40, h: pr.h + 40 });
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x * DARK_SCALE)), x1 = Math.min(dw, Math.ceil((r.x + r.w) * DARK_SCALE));
    const y0 = Math.max(0, Math.floor(r.y * DARK_SCALE)), y1 = Math.min(dh, Math.ceil((r.y + r.h) * DARK_SCALE));
    for (let y = y0; y < y1; y++) small.fill(0, y * dw + x0, y * dw + Math.max(x0, x1));
  }
  const H = calib!.camToProj.map((v, i) => (i < 6 ? v * DARK_SCALE : v));
  const cam = warpMask({ width: dw, height: dh, data: small }, H, frame.width, frame.height);
  return minFilter({ width: cam.width, height: cam.height, data: Uint8ClampedArray.from(cam.data) }, 2);
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
      void saveCalibrationFrames(why);
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
    if (k === 'e') {
      // the whole wall for Runway: every drawing where it is now (captures/runway-in/scene-…)
      void exportScene(doodles(), stage.size(), { w: stage.canvas.width, h: stage.canvas.height }).then((name) => say(name ? `saved for Runway: ${name}` : 'could not save — is the server running?'));
    }
    if (k === 'v') { if (latestScene) playScene(latestScene); else say('no scene clip yet — drop one into captures/runway-out/'); }
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

    const grabbed = grabFrame(video);
    // how lit by the projector each pixel is, per colour channel (vision/light.ts); plain brightness before calibration
    const frame = calib ? litFrame(grabbed.rgb, calib.light) : grabbed.luma;
    let mask: Mask;
    let scene: Scene | null = null;
    if (calib) {
      // what we project right now (ink, drawings, the coloured pen line, panels), as the camera sees it
      const projected = projectedInCamera(frame);
      const dark = ownInk(projected);
      darkPx = countOnes(dark);
      mask = shadowMask(frame, calib.light.white, 0.45, calib.light.black, projected);
      // a hand reaching across a drawing is cut in two where our own ink is: join it back up
      mask = bridgeOwnInk(mask, dark, 5);
      const rawPx = countOnes(mask);
      if (lit) mask = keepInside(mask, lit); // shadows only count on the projected picture
      shadowInfo = `shadow px: ${rawPx} seen → ${countOnes(mask)} on wall · ${findBlobs(mask).length} shape(s)`;
      // self-healing: if our creatures stop showing up where we project them, the projector moved
      const own = creatures.length ? projectedDarkInCamera(frame, false) : null;
      const steady = creatures.length ? erode(projectedDarkInCamera(frame, false, true), 2) : null;
      const score = steady && countOnes(steady) >= 1000 ? alignmentScore(grabbed.luma, calib.whiteRef, steady, calib.dark) /* blue ink is dark in plain brightness */ : null;
      if (watch.push(score, now)) { status = 'projector moved — re-aligning'; calibrate(true); return; }
      scene = analyzeScene(mask, findBlobs(mask), lit ? sceneLit(lit, projectedDarkInCamera(frame, true, false, false)) : undefined); // only on-wall panels hide the picture edge — a hand over a drawing still comes from the real edge
      if (scene) checklist.shadow('ok', 'seen — make a shape and hold it still', now);
      if (scene && lit) whyIgnored = usableReason(scene, own ?? { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, lit);
      const usable = scene && lit && isUsablePuppet(scene, own ?? { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, lit);
      // fingertip laser: point one finger and hold to draw
      // the pen follows the fingertip (the far end of the hand's shadow), nudged past it onto the wall
      const tipCam = scene && (PUPPETS ? scene.pointing : true) ? { x: scene.tip.x + scene.tipDir.x * 3, y: scene.tip.y + scene.tipDir.y * 3 } : null;
      let tipProj: { x: number; y: number } | null = null, dirProj: { x: number; y: number } | undefined;
      if (tipCam && scene) {
        tipProj = applyH(calib.camToProj, tipCam);
        const back = applyH(calib.camToProj, { x: tipCam.x - scene.tipDir.x * 6, y: tipCam.y - scene.tipDir.y * 6 });
        const dx = tipProj.x - back.x, dy = tipProj.y - back.y, d = Math.hypot(dx, dy) || 1;
        dirProj = { x: dx / d, y: dy / d }; // which way the finger points, on the wall
      }
      rawTip = tipProj;
      // pointing at a resting drawing (pen not in use): hover, then wake it — and don't start the pen
      // (any hand but a fist: the fingertip lands on the drawing's own ink, where its shadow can't be seen)
      const found = tipProj && scene && scene.pose !== 'fist' && (penState.mode === 'idle' || penState.mode === 'arming')
        ? creatures.find((c): c is Doodle => c instanceof Doodle && c.parked && c.hit(tipProj!)) : undefined;
      const resting = found ?? (hovered && now - hovered.seen < 300 ? hovered.d : undefined); // ride out a dropped frame
      if (resting) {
        if ((window as any).__trace) console.log('[trace] hover', Math.round(now));
        if (hovered?.d !== resting) hovered = { d: resting, since: now, seen: now };
        if (found) hovered.seen = now;
        if (now - hovered.since > WAKE_DWELL_MS) {
          const b = resting.box();
          resting.wake();
          sparkles.burst({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, 10, Math.max(b.w, b.h) / 2 + 30);
          hovered = null;
        }
      } else hovered = null;
      penState = pen.update(tipProj && scene && !resting ? { tip: tipProj, pose: scene.pose, dir: dirProj } : null, now);
      const finished = pen.takeFinished();
      if (finished) bringDrawingToLife(finished);
      for (const b of pen.takeBursts()) sparkles.burst(b.at, b.kind === 'finish' ? 16 : 10, b.kind === 'finish' ? 140 : 70);
      if (penState.mode === 'down' && penState.cursor) sparkles.trail(penState.cursor, dt); else sparkles.lift();
      if (scene?.pointing) lastPointingAt = now;
      if ((window as any).__trace) { (window as any).__mask = mask; (window as any).__lit = lit; (window as any).__handSeen = !!scene; (window as any).__doodles = doodles; (window as any).__wallClip = () => wallClip; }
      if ((window as any).__trace) console.log('[trace]', Math.round(now), scene ? `pointing=${scene.pointing} tip=${Math.round(scene.tip.x)},${Math.round(scene.tip.y)} box=${JSON.stringify(scene.puppetBox)} usable=${!!usable}` : 'no scene', penState.mode, scene?.pose ?? '');
      const penNearby = penState.mode !== 'idle' || now - lastPointingAt < POINTING_QUIET_MS;
      if (penNearby) hold.reset(); // a pointing finger is a pen, not a puppet
      if (PUPPETS && scene && usable && !penNearby && hold.push(scene.puppet, now)) {
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
    // the wall keeps what you made, up to a point: the oldest fade out gently
    const alive = creatures.filter((c) => !c.retiring);
    for (let i = 0; i < alive.length - MAX_CREATURES; i++) alive[i].retire();
    for (const c of creatures) c.update(dt);
    sparkles.update(dt);
    for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].done) creatures.splice(i, 1);

    if (panel!.visible) {
      panel!.render(checklist);
      // until calibrated it can't tell wall from room, so show the plain camera picture
      panel!.drawCamera(grabbed.luma, calib ? mask : { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) });
      if (checklist.shouldAutoHide(now)) panel!.show(false);
    }

    clearWhite(stage);
    // a scene clip over the whole wall: the drawings fade out under it and come back at the end
    let veil = 1;
    if (wallClip) {
      const p = wallClip.player, since = now - wallClip.at, left = p.remainingMs;
      const into = Math.min(1, since / SCENE_FADE_MS), out = Number.isFinite(left) ? Math.min(1, left / SCENE_FADE_MS) : 1;
      const on = Math.min(into, out);
      veil = 1 - on;
      const { w, h } = stage.size();
      p.draw(stage.ctx, { x: 0, y: 0, w, h }, on);
      if (p.ended || since > 60000) wallClip = null;
    }
    for (const d of doodles()) d.veil = veil;
    for (const c of creatures) c.draw(stage.ctx);
    if (note) {
      const a = Math.min(1, (now - note.at) / 250) * Math.min(1, (3200 - (now - note.at)) / 500);
      if (a <= 0) note = null;
      else {
        const c = stage.ctx, { h } = stage.size();
        c.save(); c.globalAlpha = a; c.fillStyle = INK_COLOR; c.font = '300 18px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
        c.fillText(note.text, 24, h - 52); c.restore();
      }
    }
    drawPen(stage.ctx, penState);
    if (debug && rawTip) {
      // where the camera sees your fingertip right now: on your finger = mapping is right; the pen
      // dot trailing behind it = camera delay; the + itself off your finger = re-calibrate (C)
      const c = stage.ctx;
      c.save(); c.strokeStyle = 'rgba(255,45,135,0.95)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(rawTip.x - 10, rawTip.y); c.lineTo(rawTip.x + 10, rawTip.y); c.moveTo(rawTip.x, rawTip.y - 10); c.lineTo(rawTip.x, rawTip.y + 10); c.stroke();
      c.restore();
    }
    sparkles.draw(stage.ctx);
    if (hovered) {
      // a resting drawing under the fingertip: a ring fills up, then it wakes
      const b = hovered.d.box(), k = Math.min(1, (now - hovered.since) / WAKE_DWELL_MS), r = Math.max(b.w, b.h) / 2 + 18;
      stage.ctx.save();
      stage.ctx.strokeStyle = `rgba(${accentAt(k)},0.95)`;
      stage.ctx.lineWidth = 2.5;
      stage.ctx.beginPath();
      stage.ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      stage.ctx.stroke();
      stage.ctx.restore();
    }
    if (debug) {
      const lines = [status, scene ? `shadow from ${scene.entry ?? 'nowhere'} → open ${scene.openSide}` : 'no shadow', `${creatures.length} creature(s)`, `last seen: ${lastRec}`, `ignoring ${darkPx} px`, calibInfo, shadowInfo, scene ? `shape: ${scene.pointing ? 'one finger (pen) ✎' : whyIgnored ?? 'usable ✓'}` : '', `pen: ${penState.mode} · hand: ${scene?.pose ?? '—'}`];
      if (recorder.recording) lines.push('● REC');
      // before calibration it can't tell wall from room: don't paint the room red
      drawDebug(stage.ctx, { frame: grabbed.luma, mask: calib ? mask : { width: frame.width, height: frame.height, data: new Uint8Array(frame.data.length) }, fps, lines, puppetBox: scene?.puppetBox ?? null });
    }
  };
  requestAnimationFrame(tick);
}

main().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:40%;left:5%;color:#c00">Camera error: ${String(err)}</pre>`);
});

/** A failed calibration: save what the camera saw (projector black | squares | white) to captures/calibration/. */
async function saveCalibrationFrames(why: string): Promise<void> {
  const f = lastCalibrationFrames;
  if (!f) return;
  const { width: w, height: h } = f.dark;
  const c = new OffscreenCanvas(w * 3, h);
  const ctx = c.getContext('2d')!;
  [f.dark, f.squares, f.white].forEach((g, k) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < g.data.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.data[i]; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, k * w, 0);
  });
  const png = await c.convertToBlob({ type: 'image/png' });
  await fetch(`/api/calibration?why=${encodeURIComponent(why.slice(0, 120))}`, { method: 'POST', body: png }).catch(() => {});
}
