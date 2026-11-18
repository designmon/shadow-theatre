import type { Box, Mask, Pt, Side } from '../types';
import type { Blob } from './blobs';
import { findFingers, longFingers, pickFinger, refineTip } from './fingers';

/** neck: cross-width of the shadow just behind the puppet / the puppet's cross-width (null if nothing behind it). */
/** pointing: one thin finger sticking out (laser drawing); tip: its fingertip; tipDir: which way it points. */
/** pose: point = one finger out (pen draws), fist = closed hand (finish), open = anything else (pen lifted). */
export type Pose = 'point' | 'fist' | 'open';
export type Scene = { puppet: Mask; puppetBox: Box; entry: Side | null; openSide: Side; bodyBox: Box | null; neck: number | null; pointing: boolean; tip: Pt; tipDir: Pt; pose: Pose; palm?: Pt };

const TIP_FRACTION = 0.3;
const MIN_TIP_FRACTION = 0.12; // smallest puppet window, of the wall size
const ARM_KEEP_FRACTION = 0.15; // arm kept behind the wrist, of the wall size
const MAX_FAR_FRACTION = 0.7; // the puppet is never more than this much of the shadow's length
const NECK_BAND = 6; // px behind the puppet used to measure the wrist/neck
const MAX_NECK = 0.75; // a hand sticks out from a narrower arm; a head-and-shoulders doesn't

function boxOf(indices: Iterable<number>, W: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of indices) {
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The performer's shadow: where it enters the frame, the "puppet" (the far
 * tip, where the hands are), and the open side for creatures to move into.
 */
/** Remembered between frames: where the arm comes in (it doesn't jump; a hand touching another edge later shouldn't move it). */
export type SceneMemory = { entry?: Pt; seenAt?: number };

export function analyzeScene(mask: Mask, blobs: Blob[], lit?: Mask, prevTip?: Pt | null, memory?: SceneMemory, litAt?: (x: number, y: number) => number): Scene | null {
  const blob = blobs[0];
  if (!blob) return null;
  const { width: W, height: H } = mask;
  const sides: Side[] = ['left', 'right', 'up', 'down'];
  const puppet: Mask = { width: W, height: H, data: new Uint8Array(W * H) };

  // Where the shadow comes in: centroid of its pixels on the wall's edge.
  const off = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || (lit ? !lit.data[y * W + x] : false);
  let ax = 0, ay = 0, n = 0;
  for (const i of blob.pixels) {
    const x = i % W, y = (i / W) | 0;
    if (off(x - 1, y) || off(x + 1, y) || off(x, y - 1) || off(x, y + 1)) { ax += x; ay += y; n++; }
  }

  if (n === 0) {
    for (const i of blob.pixels) puppet.data[i] = 1;
    const b = blob.box;
    const gaps: Record<Side, number> = { left: b.x, right: W - (b.x + b.w), up: b.y, down: H - (b.y + b.h) };
    const openSide = sides.reduce((a, c) => (gaps[c] > gaps[a] ? c : a));
    return { puppet, puppetBox: b, entry: null, openSide, bodyBox: null, neck: null, pointing: false, tip: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, tipDir: { x: 0, y: 0 }, pose: 'open' };
  }
  ax /= n; ay /= n;

  // Distance ALONG the shadow from where it comes in (body -> arm -> hand -> ears).
  // The puppet is the far end of that path, whichever way its ears or fingers point.
  const inBlob = new Uint8Array(W * H);
  for (const i of blob.pixels) inBlob[i] = 1;
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(blob.pixels.length);
  let qh = 0, qt = 0;
  // Where it comes in: only the biggest place the shadow touches the picture's edge (the arm).
  // A fist or fingertip that also touches an edge somewhere must not count as "where it comes in".
  const edge: number[] = [];
  for (const i of blob.pixels) {
    const x = i % W, y = (i / W) | 0;
    if (off(x - 1, y) || off(x + 1, y) || off(x, y - 1) || off(x, y + 1)) edge.push(i);
  }
  const edgeSet = new Set(edge), group = new Map<number, number>();
  let best = -1, bestN = 0;
  const groups: { id: number; n: number; c: Pt }[] = [];
  for (const s0 of edge) {
    if (group.has(s0)) continue;
    const st = [s0];
    group.set(s0, s0);
    let n0 = 0;
    while (st.length) {
      const i = st.pop()!, x = i % W;
      n0++;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || x + dx >= W) continue;
        const j = i + dy * W + dx;
        if (edgeSet.has(j) && !group.has(j)) { group.set(j, s0); st.push(j); }
      }
    }
    if (n0 > bestN) { bestN = n0; best = s0; }
    groups.push({ id: s0, n: n0, c: { x: 0, y: 0 } });
  }
  if (groups.length > 1 && memory?.entry) {
    // stay with where the arm came in before
    for (const g of groups) { let sx = 0, sy = 0; for (const i of edge) if (group.get(i) === g.id) { sx += i % W; sy += (i / W) | 0; } g.c = { x: sx / g.n, y: sy / g.n }; }
    const near = groups.reduce((a, b) => (Math.hypot(b.c.x - memory.entry!.x, b.c.y - memory.entry!.y) < Math.hypot(a.c.x - memory.entry!.x, a.c.y - memory.entry!.y) ? b : a));
    if (Math.hypot(near.c.x - memory.entry.x, near.c.y - memory.entry.y) < Math.max(W, H) * 0.25) best = near.id;
  }
  if (memory) {
    let sx = 0, sy = 0, n1 = 0;
    for (const i of edge) if (group.get(i) === best) { sx += i % W; sy += (i / W) | 0; n1++; }
    if (n1) memory.entry = { x: sx / n1, y: sy / n1 };
  }
  const entryPx = new Set<number>();
  for (const i of edge) if (group.get(i) === best) { dist[i] = 0; queue[qt++] = i; entryPx.add(i); }
  let far = 0;
  while (qh < qt) {
    const i = queue[qh++], x = i % W, d = dist[i] + 1;
    if (dist[i] > far) far = dist[i];
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
    for (const j of nb) if (j >= 0 && j < W * H && inBlob[j] && dist[j] < 0) { dist[j] = d; queue[qt++] = j; }
  }

  // measured against the wall as the camera sees it (it may fill only part of the view)
  let wx0 = W, wx1 = -1, wy0 = H, wy1 = -1;
  if (lit) for (let i = 0; i < lit.data.length; i++) if (lit.data[i]) {
    const x = i % W, y = (i / W) | 0;
    if (x < wx0) wx0 = x; if (x > wx1) wx1 = x; if (y < wy0) wy0 = y; if (y > wy1) wy1 = y;
  }
  const wallW = lit && wx1 >= wx0 ? wx1 - wx0 + 1 : W, wallH = lit && wy1 >= wy0 ? wy1 - wy0 + 1 : H;
  // Find the wrist: walking back along the shadow from the fingertips/ears, the shadow
  // widens into the hand and then narrows again at the wrist/forearm. Cut there.
  const widths = new Float32Array(far + 1);
  for (const i of blob.pixels) widths[dist[i]]++;
  const smooth = (d: number) => {
    let s = 0, k = 0;
    for (let e = d - 2; e <= d + 2; e++) if (e >= 0 && e <= far) { s += widths[e]; k++; }
    return s / k;
  };
  const minSpan = Math.max(wallW, wallH) * MIN_TIP_FRACTION;
  let widest = far, widestW = -1;
  for (let d = Math.floor(far * 0.55); d <= far; d++) { const w = smooth(d); if (w > widestW) { widestW = w; widest = d; } }
  let wrist = Math.floor(far * 0.2), wristW = Infinity;
  for (let d = Math.floor(far * 0.2); d <= widest; d++) { const w = smooth(d); if (w <= wristW) { wristW = w; wrist = d; } } // ties: the narrow spot nearest the hand
  // a shadow with no clear wrist (one even blob) keeps a sensible minimum, and never the whole far side
  const span = Math.min(far * MAX_FAR_FRACTION, Math.max(minSpan, far - wrist));

  // The puppet keeps a short piece of arm behind the wrist: it's the swan's neck, and context for Claude.
  const cut = far - span;
  const keep = Math.max(0, Math.min(cut, Math.max(wallW, wallH) * ARM_KEEP_FRACTION, far * MAX_FAR_FRACTION - span));
  // Walk back from the hand down the arm (only towards where the shadow comes in), counting steps.
  // Parts of the body that are merely as far from the edge as the arm never get mixed in.
  const back = new Int32Array(W * H).fill(-1);
  const hand: number[] = [];
  qh = 0; qt = 0;
  for (const i of blob.pixels) if (dist[i] >= cut) { back[i] = 0; hand.push(i); queue[qt++] = i; }
  const maxBack = Math.max(keep, 4 * NECK_BAND);
  while (qh < qt) {
    const i = queue[qh++], x = i % W;
    if (back[i] >= maxBack) continue;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
    for (const j of nb) {
      if (j < 0 || j >= W * H || !inBlob[j] || back[j] >= 0 || dist[j] >= dist[i]) continue;
      back[j] = back[i] + 1;
      queue[qt++] = j;
    }
  }
  const tip: number[] = [], body: number[] = [], band: number[] = [], armBack: number[] = [];
  for (const i of blob.pixels) {
    const k = back[i];
    if (k >= 1 && k <= NECK_BAND) band.push(i);
    else if (k > 2 * NECK_BAND && k <= 4 * NECK_BAND) armBack.push(i);
    (k >= 0 && k <= keep ? tip : body).push(i);
  }
  for (const i of tip) puppet.data[i] = 1;

  // Reach direction: the way the arm points just before the wrist (ears/fingers can stick out
  // sideways, the forearm doesn't); without an arm, from the wrist into the puppet.
  const centroid = (idx: number[]) => {
    let sx = 0, sy = 0;
    for (const i of idx) { sx += i % W; sy += (i / W) | 0; }
    return { x: sx / idx.length, y: sy / idx.length };
  };
  const [to, from] = band.length && armBack.length
    ? [centroid(band), centroid(armBack)]
    : [centroid(hand), band.length ? centroid(band) : { x: ax, y: ay }];
  const dx = to.x - from.x, dy = to.y - from.y;
  const openSide: Side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', up: 'down', down: 'up' };

  // How wide is the shadow just behind the puppet (wrist / forearm vs. torso)?
  const horizontal = openSide === 'left' || openSide === 'right';
  const cross = (i: number) => (horizontal ? (i / W) | 0 : i % W);
  const extent = (idx: number[]) => {
    let lo = Infinity, hi = -Infinity;
    for (const i of idx) { const c = cross(i); if (c < lo) lo = c; if (c > hi) hi = c; }
    return hi < lo ? 0 : hi - lo + 1;
  };
  const neck = band.length ? extent(band) / Math.max(1, extent(hand)) : null;
  const { pieces, ...finger } = pointingFinger(blob.pixels, dist, far, W, Math.max(wallW, wallH));
  // fist: a compact end (about as long as it is wide); open: several fingers, or a long flat hand
  const handLen = far - cut, handW = extent(hand);
  let pose: Pose = finger.pointing ? 'point' : pieces >= 2 ? 'open' : handLen <= 1.35 * handW ? 'fist' : 'open';
  // Better: find the fingers by their shape (vision/fingers.ts). One long finger = point, and the
  // pen is that finger's own tip, wherever the arm comes from; several = open; none = fist (if compact).
  // only where the ARM comes in is "the arm" — a fingertip touching another edge of the picture
  // (drawing near the bottom) is still a finger
  const handShape = findFingers(inBlob, W, H, Array.from(blob.pixels), (i) => entryPx.has(i), dist, far);
  // drawing: keep following the finger the pen is on, whatever else the hand is doing (a thumb out,
  // other fingers showing) — it only waits if no finger is anywhere near where the tip just was
  const tracked = prevTip && handShape
    ? handShape.fingers.filter((f) => f.length >= 0.6 * handShape.palmR).sort((a, b) => Math.hypot(a.tip.x - prevTip.x, a.tip.y - prevTip.y) - Math.hypot(b.tip.x - prevTip.x, b.tip.y - prevTip.y))[0]
    : undefined;

  if (handShape && tracked && Math.hypot(tracked.tip.x - prevTip!.x, tracked.tip.y - prevTip!.y) <= 3 * handShape.palmR) {
    pose = 'point';
    finger.tip = litAt ? refineTip(tracked.tip, tracked.dir, litAt, tracked.width) : tracked.tip;
    finger.tipDir = tracked.dir;
    finger.pointing = true;
  } else if (handShape) {
    const long = longFingers(handShape);
    if (long.length) {
      const f = pickFinger(handShape, prevTip ?? null)!;
      pose = long.length === 1 ? 'point' : 'open';
      // drawing, and the only finger in sight is far from where the fingertip just was: that's not
      // the fingertip (it's hidden over the hand's own shadow) — say so, and the pen waits for it
      if (prevTip && Math.hypot(f.tip.x - prevTip.x, f.tip.y - prevTip.y) > 3 * handShape.palmR) pose = 'open';
      finger.tip = litAt ? refineTip(f.tip, f.dir, litAt, f.width) : f.tip; // between pixels: a steady line
      finger.tipDir = f.dir;
      finger.pointing = pose === 'point';
    } else {
      finger.pointing = false;
      // no finger out: a fist (nothing reaches past the palm by more than about its radius), or a
      // flat hand with the fingers together (it does)
      const beyondPalm = far - Math.max(0, dist[handShape.palmIndex]);
      pose = beyondPalm <= 2.1 * handShape.palmR ? 'fist' : 'open'; // (steps along the shadow overstate diagonals a little)
    }
  }
  return { puppet, puppetBox: boxOf(tip, W)!, entry: opposite[openSide], openSide, bodyBox: boxOf(body, W), neck, ...finger, pose, palm: handShape?.palm };
}

const MAX_PUPPET_FRACTION = 0.5; // of the lit wall (bodies are caught by the hand-sticking-out rule)
const TOUCH_PX = 3;

/**
 * Whether a scene's puppet is a trustworthy hand shape: not partly hidden by
 * (touching) one of our own projected creatures, and not so big it must be a body.
 */
export function isUsablePuppet(scene: Scene, ownDarkCam: Mask, lit: Mask): boolean {
  return usableReason(scene, ownDarkCam, lit) === null;
}

/** Why a puppet is ignored (null = usable). Shown in the debug view. */
export function usableReason(scene: Scene, ownDarkCam: Mask, lit: Mask): string | null {
  let litArea = 0;
  for (const v of lit.data) litArea += v;
  const b = scene.puppetBox;
  if (b.w * b.h > MAX_PUPPET_FRACTION * litArea) return 'ignored: too big (looks like a body)';
  if (scene.neck !== null && scene.neck > MAX_NECK) return 'ignored: not a hand sticking out (body / standing)'; // someone just standing there
  const W = ownDarkCam.width, H = ownDarkCam.height;
  for (let y = Math.max(0, b.y - TOUCH_PX); y < Math.min(H, b.y + b.h + TOUCH_PX); y++) {
    for (let x = Math.max(0, b.x - TOUCH_PX); x < Math.min(W, b.x + b.w + TOUCH_PX); x++) {
      if (!ownDarkCam.data[y * W + x]) continue;
      // is any puppet pixel within TOUCH_PX of this dark pixel?
      for (let dy = -TOUCH_PX; dy <= TOUCH_PX; dy++) for (let dx = -TOUCH_PX; dx <= TOUCH_PX; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= 0 && py >= 0 && px < W && py < H && scene.puppet.data[py * W + px]) return 'ignored: touching one of our creatures';
      }
    }
  }
  return null;
}

/**
 * The wall as far as scene analysis is concerned: lit, and not hidden by
 * something we project ourselves (setup card, debug view, creatures). A shadow
 * running under one of those counts as entering from there.
 */
export function sceneLit(lit: Mask, ignored: Mask): Mask {
  const data = new Uint8Array(lit.data.length);
  for (let i = 0; i < data.length; i++) data[i] = lit.data[i] && !ignored.data[i] ? 1 : 0;
  return { width: lit.width, height: lit.height, data };
}

/**
 * One finger pointing: the last stretch of the shadow (along the shadow) is a single thin piece.
 * Two fingers (rabbit ears) give two pieces; a snout or a beak is too wide.
 */
function pointingFinger(pixels: Int32Array, dist: Int32Array, far: number, W: number, wallSize: number): { pointing: boolean; tip: Pt; tipDir: Pt; pieces: number } {
  const fingerW = Math.max(3, wallSize * 0.035), L = 2.5 * fingerW;
  const end: number[] = [];
  let tx = 0, ty = 0, tn = 0;
  for (const i of pixels) {
    if (dist[i] >= far - L) end.push(i);
    if (dist[i] >= far - 1) { tx += i % W; ty += (i / W) | 0; tn++; } // the very end of the finger, averaged: a steadier point
  }
  const tip = { x: tx / Math.max(1, tn) + 0.5, y: ty / Math.max(1, tn) + 0.5 };
  // how many separate pieces is the end made of?
  const inEnd = new Set(end), seen = new Set<number>();
  let pieces = 0;
  for (const s of end) {
    if (seen.has(s)) continue;
    pieces++;
    const stack = [s];
    seen.add(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && inEnd.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  let cx = 0, cy = 0;
  for (const i of end) { cx += i % W; cy += (i / W) | 0; }
  cx = cx / Math.max(1, end.length) + 0.5; cy = cy / Math.max(1, end.length) + 0.5;
  const dx = tip.x - cx, dy = tip.y - cy, d = Math.hypot(dx, dy) || 1;
  // A finger sticking out of something. Either thin for this wall, or — when the hand is near the
  // projector and its shadow is big — clearly narrower than the hand behind it (scale-free).
  let back = 0;
  for (const i of pixels) if (dist[i] >= far - 3 * L && dist[i] < far - 2 * L) back++;
  const endW = end.length / L, backW = back / L;
  const thin = end.length <= L * fingerW * 1.1;
  const narrowerThanHand = backW > 0 && endW <= 0.5 * backW;
  const pointing = pieces === 1 && far > 1.6 * L && (thin || narrowerThanHand);
  if ((globalThis as any).__trace) (globalThis as any).__finger = { pieces, end: end.length, maxEnd: L * fingerW * 1.1, far, L, fingerW, wallSize };
  return { pointing, tip, tipDir: { x: dx / d, y: dy / d }, pieces };
}
