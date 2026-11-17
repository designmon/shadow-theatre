import type { Box, Pt } from '../types';
import { DIRS, type Spawn } from './types';

function rng(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(p: Pt, b: Box, pad: number) {
  return p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
}

/** A wandering route from the anchor, out through the open side, off the wall. */
/** `wander`: number of random stops across the free wall before heading off (so it can be enjoyed). */
export function planPath(spawn: Spawn, seed = Date.now(), opts: { wander?: number } = {}): Pt[] {
  const rand = rng(seed);
  const { anchorBox: a, wall, avoid } = spawn;
  const d = DIRS[spawn.openSide];
  const size = Math.max(a.w, a.h);
  const c = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const roomTo = (dir: { x: number; y: number }, p: Pt) =>
    dir.x > 0 ? wall.w - p.x : dir.x < 0 ? p.x : dir.y > 0 ? wall.h - p.y : p.y;
  const ahead = roomTo(d, c);
  const p1Dist = Math.min(size * 1.2, Math.max(ahead - size * 0.6, size * 0.5));
  const p1 = { x: c.x + d.x * p1Dist, y: c.y + d.y * p1Dist };
  // Little room ahead (< 40% of the wall): turn along the wall toward the roomier side.
  const alongDim = d.x !== 0 ? wall.w : wall.h;
  let e = d;
  if (ahead < 0.4 * alongDim) {
    const perpA = { x: -d.y, y: d.x }, perpB = { x: d.y, y: -d.x };
    e = roomTo(perpA, p1) >= roomTo(perpB, p1) ? perpA : perpB;
  }
  const q = { x: -e.y, y: e.x }; // wobble axis
  const total = Math.max(0, roomTo(e, p1)) + size * 1.5;
  const qDim = q.x !== 0 ? wall.w : wall.h;
  const margin = size * 0.6;
  const pts: Pt[] = [c, p1];
  if (opts.wander) {
    // meander: random stops in the free wall (not behind the performer), then leave from the last one
    const m = size * 0.8;
    let from = p1;
    for (let i = 0; i < opts.wander; i++) {
      let q = from;
      for (let tries = 0; tries < 80; tries++) {
        const cand = { x: m + rand() * (wall.w - 2 * m), y: m + rand() * (wall.h - 2 * m) };
        const far = Math.hypot(cand.x - from.x, cand.y - from.y) > Math.max(wall.w, wall.h) * 0.3; // real hops across the wall
        if (far && !(avoid && inside(cand, avoid, size))) { q = cand; break; }
      }
      pts.push(q);
      from = q;
    }
    return [...pts, ...exitFrom(from, spawn, size, rand)];
  }
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const along = (total * i) / n;
    const wob = i === n ? 0 : (rand() * 2 - 1) * 0.12 * qDim;
    let p = { x: p1.x + e.x * along + q.x * wob, y: p1.y + e.y * along + q.y * wob };
    if (q.x !== 0) p.x = Math.min(wall.w - margin, Math.max(margin, p.x));
    else p.y = Math.min(wall.h - margin, Math.max(margin, p.y));
    if (avoid && inside(p, avoid, 12)) {
      // push across the avoid box along the wobble axis, away from its center
      const ac = { x: avoid.x + avoid.w / 2, y: avoid.y + avoid.h / 2 };
      const cur = (p.x - ac.x) * q.x + (p.y - ac.y) * q.y;
      const sgn = cur >= 0 ? 1 : -1;
      const half = (q.x !== 0 ? avoid.w : avoid.h) / 2 + 14;
      p = { x: p.x + q.x * (sgn * half - cur), y: p.y + q.y * (sgn * half - cur) };
    }
    pts.push(p);
  }
  return pts;
}

export function pointAlong(path: Pt[], dist: number): Pt {
  let left = dist;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return path[path.length - 1];
}

/** A short route from `p` off the nearest wall edge that isn't behind the performer. */
function exitFrom(p: Pt, spawn: Spawn, size: number, rand: () => number): Pt[] {
  const { wall, avoid } = spawn;
  const sides = [
    { d: { x: 1, y: 0 }, dist: wall.w - p.x }, { d: { x: -1, y: 0 }, dist: p.x },
    { d: { x: 0, y: 1 }, dist: wall.h - p.y }, { d: { x: 0, y: -1 }, dist: p.y },
  ].filter((s) => {
    if (!avoid) return true;
    const ac = { x: avoid.x + avoid.w / 2, y: avoid.y + avoid.h / 2 };
    return (ac.x - p.x) * s.d.x + (ac.y - p.y) * s.d.y <= 0; // not heading towards the performer
  }).sort((a, b) => a.dist - b.dist);
  const d = (sides[0] ?? { d: DIRS[spawn.openSide] }).d;
  const out = Math.max(0, d.x > 0 ? wall.w - p.x : d.x < 0 ? p.x : d.y > 0 ? wall.h - p.y : p.y) + size * 1.5;
  const wob = (rand() * 2 - 1) * size;
  return [{ x: p.x + d.x * out * 0.5 - d.y * wob, y: p.y + d.y * out * 0.5 + d.x * wob }, { x: p.x + d.x * out, y: p.y + d.y * out }];
}
