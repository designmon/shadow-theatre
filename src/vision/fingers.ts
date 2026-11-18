import type { Pt } from '../types';

/**
 * Fingers in a hand's shadow, found by shape, not by where the arm comes from.
 *
 * The palm is the widest round part of the hand. Strip everything thinner than about half the
 * palm ("opening"): what sticks out are fingers (and the thumb). Each finger is measured from
 * where it leaves the palm to its tip. So the pen follows the tip of the finger itself, whichever
 * way the hand points and wherever the arm enters the picture, and a thumb or a knuckle that
 * happens to stick out further from the edge doesn't steal it.
 */
export type Finger = { tip: Pt; dir: Pt; length: number; width: number };
export type Hand = { fingers: Finger[]; palmR: number; palm: Pt; palmIndex: number; /** distance to the shadow's edge, per pixel */ depth: Float32Array };

/** Chamfer (3-4) distance to the nearest pixel NOT in `inside`, in px. */
function distanceInside(inside: Uint8Array, W: number, H: number): Float32Array {
  const d = new Float32Array(W * H);
  const BIG = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, d[i - W] + 3); if (x > 0) v = Math.min(v, d[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3); else v = Math.min(v, 3);
    if (y < H - 1) { v = Math.min(v, d[i + W] + 3); if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4); if (x > 0) v = Math.min(v, d[i + W - 1] + 4); } else v = Math.min(v, 3);
    d[i] = v;
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * The palm: walking back from the far end of the shadow (along it), the first wide part — before
 * the shadow narrows again at the wrist, and close enough to the far end for its size (a body
 * further down the arm is wider, but far too far back to be the palm).
 */
function findPalm(pixels: number[], dist: Int32Array, far: number, dt: Float32Array): number | null {
  const prof = new Float32Array(far + 1), at = new Int32Array(far + 1).fill(-1);
  for (const i of pixels) { const d = dist[i]; if (d >= 0 && dt[i] > prof[d]) { prof[d] = dt[i]; at[d] = i; } }
  // walking back from the far end: how wide does the hand get before the wrist?
  let bestR = 0, bestD = -1, narrowFor = 0;
  for (let d = far; d >= 0; d--) {
    const r = prof[d];
    if (at[d] < 0) continue;
    if (far - d <= 6 * r && r >= 0.97 * bestR) { bestR = Math.max(bestR, r); bestD = d; narrowFor = 0; } // ties: further back (a flat hand's palm is behind its fingers)
    else if (bestD >= 0 && r < 0.85 * bestR) { if (++narrowFor > Math.max(2, 0.5 * bestR)) break; } // past the wrist
    else narrowFor = 0;
  }
  if (bestD < 0) return null;
  // The palm is the MIDDLE of that wide stretch, not its single widest pixel: where the hand and arm
  // are about equally wide, "the widest" jumps along the arm from frame to frame; the middle doesn't.
  let lo = bestD, hi = bestD;
  while (hi + 1 <= far && at[hi + 1] >= 0 && prof[hi + 1] >= 0.9 * bestR) hi++;
  while (lo - 1 >= 0 && at[lo - 1] >= 0 && prof[lo - 1] >= 0.9 * bestR && far - (lo - 1) <= 6 * bestR) lo--;
  // (toward the far end from the widest point, at most a palm's width: keeps a flat hand's palm behind its fingers)
  hi = Math.min(hi, bestD + Math.round(bestR));
  const mid = Math.round((lo + hi) / 2);
  return at[mid] >= 0 ? at[mid] : at[bestD];
}

/**
 * @param inBlob  the shadow (1 = shadow)
 * @param pixels  the shadow's pixels; dist/far: steps along it from where it comes in
 * @param atEdge  true for pixels touching the picture's edge (the arm comes in there: not a finger)
 */
export function findFingers(inBlob: Uint8Array, W: number, H: number, pixels: number[], atEdge: (i: number) => boolean, dist?: Int32Array, far?: number): Hand | null {
  if (pixels.length < 12) return null;
  const dt = distanceInside(inBlob, W, H);
  let palmI = pixels[0], palmR = 0;
  const found = dist && far !== undefined ? findPalm(pixels, dist, far, dt) : null;
  if (found !== null) { palmI = found; palmR = dt[found]; }
  else for (const i of pixels) if (dt[i] > palmR) { palmR = dt[i]; palmI = i; }
  if (palmR < 1.5) return null;
  const r = Math.max(1.2, 0.55 * palmR);
  // opening: keep what a disc of radius r can reach while staying inside the shadow
  const core = new Uint8Array(W * H);
  for (let i = 0; i < core.length; i++) core[i] = inBlob[i] && dt[i] >= r ? 1 : 0;
  const notCore = new Uint8Array(W * H);
  for (let i = 0; i < core.length; i++) notCore[i] = core[i] ? 0 : 1;
  const toCore = distanceInside(notCore, W, H); // distance to the nearest core pixel
  const thin = new Uint8Array(W * H);
  for (let i = 0; i < thin.length; i++) thin[i] = inBlob[i] && toCore[i] > r + 0.5 ? 1 : 0;

  // only near the hand: within a palm-and-a-bit of it
  const px = palmI % W, py = (palmI / W) | 0, reach = palmR * 6;
  const fingers: Finger[] = [];
  const seen = new Uint8Array(W * H), steps = new Int32Array(W * H).fill(-1);
  for (let s = 0; s < thin.length; s++) {
    if (!thin[s] || seen[s]) continue;
    // one connected piece of "thin"
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    let touchesEdge = false;
    while (stack.length) {
      const i = stack.pop()!, x = i % W;
      comp.push(i);
      if (atEdge(i)) touchesEdge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && thin[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (touchesEdge || comp.length < 4) continue;
    let cx = 0, cy = 0;
    for (const i of comp) { cx += i % W; cy += (i / W) | 0; }
    cx /= comp.length; cy /= comp.length;
    if (Math.hypot(cx - px, cy - py) > reach) continue;
    // walk out from where it leaves the palm
    const q: number[] = [];
    for (const i of comp) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && inBlob[j] && !thin[j]) { steps[i] = 1; q.push(i); break; }
    }
    if (!q.length) continue; // not attached to the hand
    // a finger is attached at one end only; a thin piece joining two wide parts (an arm between
    // the body and the fist) is a bridge, not a finger
    const attach = new Set(q), clusterOf = new Map<number, number>();
    let clusters = 0;
    for (const a0 of q) {
      if (clusterOf.has(a0)) continue;
      clusters++;
      const st = [a0];
      clusterOf.set(a0, clusters);
      while (st.length) {
        const i = st.pop()!, x = i % W;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (x + dx < 0 || x + dx >= W) continue;
          const j = i + dy * W + dx;
          if (attach.has(j) && !clusterOf.has(j)) { clusterOf.set(j, clusters); st.push(j); }
        }
      }
    }
    if (clusters > 1) { for (const i of q) steps[i] = -1; continue; }
    let len = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W;
      if (steps[i] > len) len = steps[i];
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < W * H && thin[j] && steps[j] < 0) { steps[j] = steps[i] + 1; q.push(j); }
    }
    const width = comp.length / len;
    if (len < 1.2 * width || len < 0.6 * palmR) continue; // a bump, not a finger
    let tx = 0, ty = 0, tn = 0, bx = 0, by = 0, bn = 0;
    for (const i of comp) {
      if (steps[i] >= len - 1) { tx += i % W; ty += (i / W) | 0; tn++; }
      if (steps[i] <= 2) { bx += i % W; by += (i / W) | 0; bn++; }
    }
    const tip = { x: tx / tn + 0.5, y: ty / tn + 0.5 }, base = { x: bx / bn + 0.5, y: by / bn + 0.5 };
    const dl = Math.hypot(tip.x - base.x, tip.y - base.y) || 1;
    fingers.push({ tip, dir: { x: (tip.x - base.x) / dl, y: (tip.y - base.y) / dl }, length: len + r, width });
    for (const i of comp) steps[i] = -1;
  }
  fingers.sort((a, b) => b.length - a.length);
  return { fingers, palmR, palm: { x: px + 0.5, y: py + 0.5 }, palmIndex: palmI, depth: dt };
}

/** The fingers that count: long ones (the thumb or a half-curled finger next to a long finger doesn't). */
export function longFingers(hand: Hand): Finger[] {
  const top = hand.fingers[0]?.length ?? 0;
  return hand.fingers.filter((f) => f.length >= Math.max(1.3 * hand.palmR, 0.62 * top));
}

/**
 * Which finger is the pen: the longest, but stay with the one it was on (its tip near the last
 * tip) unless another is clearly longer — so the pen never hops to the thumb mid-stroke.
 */
export function pickFinger(hand: Hand, prevTip: Pt | null): Finger | null {
  const long = longFingers(hand);
  if (!long.length) return null;
  if (!prevTip) return long[0];
  const near = long.reduce((a, b) => (Math.hypot(b.tip.x - prevTip.x, b.tip.y - prevTip.y) < Math.hypot(a.tip.x - prevTip.x, a.tip.y - prevTip.y) ? b : a));
  const jump = Math.hypot(near.tip.x - prevTip.x, near.tip.y - prevTip.y);
  return jump < 2.5 * hand.palmR && near.length >= 0.8 * long[0].length ? near : long[0];
}

/**
 * The fingertip, between pixels. The camera sees the wall coarsely (one camera pixel can be ten
 * pixels on the wall), so a tip taken from whole pixels jumps about and the line wobbles. Walk
 * along the finger in small steps over the camera picture (sampled smoothly) and find exactly
 * where the shadow ends; centre it across the finger the same way.
 * @param lit  how lit a point is, 0 (shadow) .. 1 (white wall), sampled between pixels
 */
export function refineTip(tip: Pt, dir: Pt, lit: (x: number, y: number) => number, width: number): Pt {
  const w = Math.max(1.5, width);
  const at = (s: number, o: number, n: Pt) => ({ x: tip.x + dir.x * s + n.x * o, y: tip.y + dir.y * s + n.y * o });
  const across = { x: -dir.y, y: dir.x };
  // along the finger: the last place it goes from shadow to lit
  let end: number | null = null, prev = lit(at(-1.5 * w, 0, across).x, at(-1.5 * w, 0, across).y);
  for (let s = -1.5 * w + 0.2; s <= 1.5 * w; s += 0.2) {
    const p = at(s, 0, across), v = lit(p.x, p.y);
    if (prev < 0.5 && v >= 0.5) end = s - 0.2 + (0.2 * (0.5 - prev)) / Math.max(1e-6, v - prev);
    prev = v;
  }
  if (end === null) return tip;
  // across the finger, a little behind the tip: centre between its two edges
  const back = end - Math.min(0.8 * w, 3);
  let left: number | null = null, right: number | null = null;
  prev = lit(at(back, -2 * w, across).x, at(back, -2 * w, across).y);
  for (let o = -2 * w + 0.2; o <= 2 * w; o += 0.2) {
    const p = at(back, o, across), v = lit(p.x, p.y);
    if (left === null && prev >= 0.5 && v < 0.5) left = o - 0.2 + (0.2 * (prev - 0.5)) / Math.max(1e-6, prev - v);
    if (prev < 0.5 && v >= 0.5) right = o - 0.2 + (0.2 * (0.5 - prev)) / Math.max(1e-6, v - prev);
    prev = v;
  }
  const mid = left !== null && right !== null && right > left ? (left + right) / 2 : 0;
  return at(end, mid, across);
}

/** Smooth (bilinear) sampling of a picture. */
export function bilinear(data: ArrayLike<number>, W: number, H: number, scale = 1): (x: number, y: number) => number {
  return (x, y) => {
    const fx = Math.min(W - 1.001, Math.max(0, x - 0.5)), fy = Math.min(H - 1.001, Math.max(0, y - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0, i = y0 * W + x0;
    const v = data[i] * (1 - ax) * (1 - ay) + data[i + 1] * ax * (1 - ay) + data[i + W] * (1 - ax) * ay + data[i + W + 1] * ax * ay;
    return v * scale;
  };
}
