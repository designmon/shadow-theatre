import { CalibrationError, calibrationWarning, lastCalibrationFrames, runCalibration, type Calibration } from './calibration/calibrate';
import { alignmentScore } from './calibration/alignment';
import { wallMask, warpMask } from './calibration/homography';
import { debounce, MisalignmentWatch } from './calibration/watch';
import { grabFrame, listCameras, saveCameraId, savedCameraId, startCamera } from './camera';
import { litFrame } from './vision/light';
import { bilinear } from './vision/fingers';
import { compositionArea, drawDecor, layout, type Decor } from './draw/composition';
import { pauseIcon, WallButton } from './ui/wallButton';
import { Clicker } from './ui/clicker';
import { Director, StoryLog } from './story/director';
import { ScriptRunner, type Plan } from './story/script';
import { VoiceInput } from './voice/voice';
import { StopSign, WaveDetector } from './vision/gestures';
import { ListeningUI } from './ui/listening';
import { AiArtist } from './draw/aiHand';
import { fitIcon, ICONS } from './draw/icons';
import { zoneOf } from './draw/composition';
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
import { analyzeScene, isUsablePuppet, sceneLit, usableReason, type Scene, type SceneMemory } from './vision/scene';
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
const MAX_CREATURES = 18; // the composition keeps its own limits per zone (draw/composition.ts)
const pen = new LaserPen();
const sparkles = new Sparkles();
/** Shadow-puppet recognition (hold a hand shape -> animal). Off while the fingertip pen is the focus. */
const PUPPETS = false;
let penState: PenState = { mode: 'idle', arm: 0, finish: 0, cursor: null, strokes: [] };
let hovered: { d: Doodle; since: number; seen: number } | null = null;
const sceneMemory: SceneMemory = {}; // where the arm comes in, kept between frames
let lastTipCam: { x: number; y: number } | null = null; // the pen's finger last frame (camera px): stay on it
let rawTip: { x: number; y: number } | null = null; // where the camera sees the fingertip this frame (debug: a small +) // a resting drawing the fingertip points at
const WAKE_DWELL_MS = 500;
let lastPointingAt = -Infinity;
const POINTING_QUIET_MS = 1500; // a finger seen pointing recently is a pen, never a puppet

/** The row along the bottom where drawings rest: the next free place (the oldest makes room). */
/**
 * Finished drawings move to the side and arrange themselves into a little landscape (sky, ground,
 * water), with a few details of the scene's own. Re-run whenever a drawing is named or leaves.
 */
let decor: Decor | null = null;
function compose(): void {
  const ds = creatures.filter((c): c is Doodle => c instanceof Doodle && !c.retiring && !!c.what);
  const items = ds.map((d) => {
    const pts = d.restShape().flatMap((sh) => sh.pts);
    return { label: d.what, top: Math.min(...pts.map((p) => p.y)), bottom: Math.max(...pts.map((p) => p.y)), left: Math.min(...pts.map((p) => p.x)), right: Math.max(...pts.map((p) => p.x)) };
  });
  const { places, decor: dc } = layout(items, compositionArea(stage.size()));
  places.forEach((p, i) => (p ? ds[i].park(p.at, p.scale) : ds[i].retire()));
  decor = ds.length ? dc : null;
}

// the stop button on the wall: make a fist over it and open your hand (or press P)
const pauseButton = new WallButton(['pause', 'play'], pauseIcon);
const clicker = new Clicker();
// little stories between the drawings, and what a drawing does when you click it
const director = new Director(() => creatures.filter((c): c is Doodle => c instanceof Doodle && !c.retiring), () => performance.now());
let handAtWall: { x: number; y: number } | null = null;
// voice commands: wave to talk, a stop sign (or send) to submit; the drawings act it out
const story = new StoryLog();
const voice = new VoiceInput();
const waveDetector = new WaveDetector();
const stopSign = new StopSign();
const listeningUI = new ListeningUI();
let thinking = false;
let lastCaptionAt = -1;
const runner = new ScriptRunner(() => stage.size(), () => compositionArea(stage.size()), () => performance.now());
// "draw a cat": the AI's finger comes in and draws it, then it comes alive like yours
const artist = new AiArtist();
runner.onDraw = async (what, at) => {
  const { w, h } = stage.size(), size = h * 0.28;
  const label = what.trim().split(' ').pop() ?? what; // "a big cat" -> cat
  let strokes: { x: number; y: number }[][] | null = null;
  const icon = ICONS[label] ? fitIcon(label, { cx: at.x, cy: at.y, w: size, h: size }) : null;
  if (icon) strokes = icon.map((st) => (st.closed ? [...st.pts, st.pts[0]] : st.pts));
  else {
    // nothing ready-made: the model sketches it
    try {
      const r = await (await fetch('/api/sketch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ what }) })).json();
      if (Array.isArray(r.strokes)) strokes = r.strokes.map((st: number[][]) => st.map(([x, y]) => ({ x: at.x + ((x - 50) / 100) * size, y: at.y + ((y - 50) / 100) * size })));
    } catch { /* below */ }
  }
  if (!strokes?.length) { story.add(`(I don't know how to draw a ${what} yet)`, performance.now()); return null; }
  return new Promise((resolve) => artist.start(strokes!, { w, h }, (drawn) => {
    const d = new Doodle(drawn, { w, h });
    d.frozen = pauseButton.on;
    creatures.push(d);
    d.comeAlive(motionFor(label, 'float'), label, !!icon);
    compose();
    setTimeout(() => void exportDrawing(d), 1600);
    resolve(d);
  }));
};
function startListening(): void {
  if (voice.listening || thinking) return;
  void voice.start();
  stopSign.reset();
}
async function submitVoice(): Promise<void> {
  if (!voice.listening) return;
  const text = voice.stop();
  if (!text) return;
  thinking = true;
  const ds = creatures.filter((c): c is Doodle => c instanceof Doodle && !c.retiring && !!c.id);
  const { w, h } = stage.size();
  const items = ds.map((d) => ({ id: d.id, label: d.what, x: +(d.where.x / w).toFixed(2), y: +(d.where.y / h).toFixed(2), zone: zoneOf(d.what), selected: d.selected }));
  try {
    const r = await fetch('/api/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, items }) });
    const plan = (await r.json()) as Plan;
    if (plan.story) story.add(plan.story, performance.now());
    runner.play(plan, ds);
  } catch {
    story.add('(could not reach the server)', performance.now());
  } finally {
    thinking = false;
    for (const d of ds) d.selected = false;
  }
} // where the hand is on the wall (fingertip, or palm for a fist)
let fistFrames = 0;
function setPaused(on: boolean): void {
  if (pauseButton.on !== on) pauseButton.click(performance.now());
  for (const c of creatures) if (c instanceof Doodle) c.frozen = on;
  say(on ? 'paused — the drawings rest' : 'playing');
}

/** How lit a camera point is (0 shadow .. 1 white wall), between pixels — for a precise fingertip. */
function litSampler(frame: Gray, lit: Mask | null): (x: number, y: number) => number {
  // the wall's brightness right now (the camera's exposure drifts): the 80th percentile on the lit wall
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < frame.data.length; i += 3) if (!lit || lit.data[i]) { hist[frame.data[i]]++; n++; }
  let acc = 0, white = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.8) { white = Math.max(40, v); break; } }
  return bilinear(frame.data, frame.width, frame.height, 1 / white);
}

/** A finished fingertip drawing: appears as drawn, refines, is recognised and comes alive. */
function bringDrawingToLife(strokes: { x: number; y: number }[][]): void {
  const { w, h } = stage.size();
  const doodle = new Doodle(strokes, { w, h });
  doodle.frozen = pauseButton.on;
  creatures.push(doodle);
  doodleToPng(strokes)
    .then((png) => fetch('/api/doodle', { method: 'POST', body: png, headers: { 'content-type': 'image/png' } }))
    .then((r) => (r.ok ? r.json() : { what: 'something', motion: 'float', confidence: 0 }))
    .catch(() => ({ what: 'something', motion: 'float', confidence: 0 }))
    .then((rec: { what: string; motion: Motion; confidence: number; note?: string }) => {
      const motion = motionFor(rec.what, rec.motion);
      lastRec = `drawing: ${rec.what} → ${motion}${rec.note ? ' — ' + rec.note : ''}`;
      doodle.comeAlive(motion, rec.what); // your own line, refined, with the motion that fits it
      compose(); // its place in the composition (it goes there after performing)
      director.nudge(9000); // and soon a little scene with the others
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
  if (!d) return;
  if (d.pending && !e.initial) d.revealClip(new ClipPlayer(e.url)); // made by the API just now: it comes alive by itself
  else { d.attachClip(new ClipPlayer(e.url)); say(`Runway clip ready — point at the ${d.what || 'drawing'}`); }
}, (s) => {
  // phase 2 (RUNWAYML_API_SECRET on the server): generating → a shimmer; failed → it just stops
  const name = 'pending' in s ? s.pending : s.failed;
  const d = doodles().find((x) => x.id && name === x.id);
  if (d) d.pending = 'pending' in s;
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
      lit = wallInterior(lit, 2); // the border between picture and bare wall is not a shadow (kept thin: you draw near the edges too)
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
    if (k === 'p') setPaused(!pauseButton.on);
    if (k === 'm') { if (voice.listening) void submitVoice(); else startListening(); } // the keyboard way to talk
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
      scene = analyzeScene(mask, findBlobs(mask), lit ? sceneLit(lit, projectedDarkInCamera(frame, true, false, false)) : undefined, penState.mode === 'idle' ? null : lastTipCam, sceneMemory, litSampler(frame, lit));
      lastTipCam = scene ? { ...scene.tip } : null; // only on-wall panels hide the picture edge — a hand over a drawing still comes from the real edge
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
      // the stop button: a quick fist over it (only while not drawing)
      const penFree = penState.mode === 'idle' || penState.mode === 'arming';
      fistFrames = scene?.pose === 'fist' ? fistFrames + 1 : 0;
      // a fist is where its palm is (it has no fingertip); otherwise the fingertip
      const handAt = scene && calib ? (scene.pose === 'fist' && scene.palm ? applyH(calib.camToProj, scene.palm) : tipProj) : null;
      handAtWall = handAt;
      pauseButton.feed(handAt, false, stage.size(), now); // hover look only; clicks come from the clicker
      const click = penFree ? clicker.feed(handAt, fistFrames >= 2, now) : null;
      if (click) {
        // a click (quick fist): the pause button, an answer in a bubble, or a drawing
        const wall = stage.size(), ds = doodles();
        if (pauseButton.hit(click, wall)) { setPaused(!pauseButton.on); sparkles.burst(pauseButton.centre(wall), 10, 60); }
        else if (voice.listening && listeningUI.hitSend(click)) void submitVoice();
        else {
          // a drawing: select it (or let it go) — "this", "it" in what you say next
          const d = ds.filter((x) => !x.retiring && x.what && x.hit(click)).sort((a, b) => Math.hypot(a.where.x - click.x, a.where.y - click.y) - Math.hypot(b.where.x - click.x, b.where.y - click.y))[0];
          if (d) { d.selected = !d.selected; sparkles.burst(d.anchor(), 8, 40); }
        }
      }
      // voice: wave to start listening; a stop sign to send
      const openHand = scene?.pose === 'open';
      if (penFree && !voice.listening && !thinking && waveDetector.feed(handAt, openHand, now)) startListening();
      if (voice.listening && stopSign.feed(handAt, openHand, now)) void submitVoice();
      const atButton = penFree && (pauseButton.hovered || voice.listening || (!!handAt && listeningUI.near(handAt, stage.size())));
      penState = pen.update(tipProj && scene && !resting && !atButton ? { tip: tipProj, pose: scene.pose, dir: dirProj } : null, now);
      const finished = pen.takeFinished();
      if (finished) bringDrawingToLife(finished);
      for (const b of pen.takeBursts()) sparkles.burst(b.at, b.kind === 'finish' ? 16 : 10, b.kind === 'finish' ? 140 : 70);
      if (penState.mode === 'down' && penState.cursor) sparkles.trail(penState.cursor, dt); else sparkles.lift();
      if (scene?.pointing) lastPointingAt = now;
      if ((window as any).__trace) { (window as any).__mask = mask; (window as any).__lit = lit; (window as any).__handSeen = !!scene; (window as any).__doodles = doodles; (window as any).__wallClip = () => wallClip; (window as any).__paused = () => pauseButton.on; (window as any).__caption = () => director.caption; (window as any).__story = () => story.last; (window as any).__voice = () => ({ listening: voice.listening, thinking }); (window as any).__runner = runner; (window as any).__playPlan = (p: Plan) => { story.add(p.story, performance.now()); runner.play(p, doodles()); }; (window as any).__btn = () => ({ tip: scene?.pose === 'fist' && scene.palm && calib ? applyH(calib.camToProj, scene.palm) : rawTip, hov: pauseButton.hovered, c: pauseButton.centre(stage.size()), pose: scene?.pose, fistFrames }); }
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
    director.update(pauseButton.on || runner.busy);
    runner.update();
    artist.update(dt);
    if (director.caption && director.caption.at !== lastCaptionAt) { lastCaptionAt = director.caption.at; story.add(director.caption.text, director.caption.at); }
    sparkles.update(dt);
    let gone = false;
    for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].done) { creatures.splice(i, 1); gone = true; }
    if (gone) compose();

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
    if (decor) drawDecor(stage.ctx, decor, INK_COLOR, pauseButton.on ? 0 : now, veil);
    for (const c of creatures) c.draw(stage.ctx);
    pauseButton.draw(stage.ctx, stage.size(), INK_COLOR, accentAt, now);
    { const placed: { x: number; y: number; w: number; h: number }[] = []; for (const d of doodles()) { const b = d.drawSpeech(stage.ctx, stage.size(), handAtWall, placed); if (b) placed.push(b); } }
    // selected drawings: a soft ring (what "this" means in a voice command)
    for (const d of doodles()) if (d.selected && !d.retiring) {
      const b = d.box(), c = stage.ctx;
      c.save(); c.strokeStyle = `rgba(${accentAt((Math.sin(now / 500) + 1) / 2)},0.9)`; c.lineWidth = 2; c.setLineDash([6, 6]);
      c.beginPath(); c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 18, b.h / 2 + 18, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    artist.draw(stage.ctx, INK_COLOR, accentAt(0.5));
    listeningUI.draw(stage.ctx, stage.size(), { listening: voice.listening, thinking, text: voice.text, level: voice.level(), error: voice.error, stop: stopSign.progress(now) }, INK_COLOR, now);
    story.draw(stage.ctx, stage.size(), INK_COLOR, now);
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
