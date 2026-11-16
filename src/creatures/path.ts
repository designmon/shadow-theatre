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
export function planPath(spawn: Spawn, seed = Date.now()): Pt[] {
  const rand = rng(seed);
  const { anchorBox: a, wall, avoid } = spawn;
  const d = DIRS[spawn.openSide];
  const perp = { x: -d.y, y: d.x };
  const size = Math.max(a.w, a.h);
  const c = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const p1 = { x: c.x + d.x * size * 1.2, y: c.y + d.y * size * 1.2 };
  // distance from p1 to the open edge, then beyond it by 1.5 sizes
  const toEdge = d.x > 0 ? wall.w - p1.x : d.x < 0 ? p1.x : d.y > 0 ? wall.h - p1.y : p1.y;
  const total = Math.max(0, toEdge) + size * 1.5;
  const perpDim = perp.x !== 0 ? wall.w : wall.h;
  const margin = size * 0.6;
  const pts: Pt[] = [c, p1];
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const along = (total * i) / n;
    const wob = i === n ? 0 : (rand() * 2 - 1) * 0.12 * perpDim;
    let p = { x: p1.x + d.x * along + perp.x * wob, y: p1.y + d.y * along + perp.y * wob };
    // keep the cross-axis on the wall
    if (perp.x !== 0) p.x = Math.min(wall.w - margin, Math.max(margin, p.x));
    else p.y = Math.min(wall.h - margin, Math.max(margin, p.y));
    if (avoid && inside(p, avoid, 12)) {
      // push across the avoid box along the perpendicular, away from its center
      const ac = { x: avoid.x + avoid.w / 2, y: avoid.y + avoid.h / 2 };
      const s = (p.x - ac.x) * perp.x + (p.y - ac.y) * perp.y >= 0 ? 1 : -1;
      const half = (perp.x !== 0 ? avoid.w : avoid.h) / 2 + 14;
      const cur = (p.x - ac.x) * perp.x + (p.y - ac.y) * perp.y;
      p = { x: p.x + perp.x * (s * half - cur), y: p.y + perp.y * (s * half - cur) };
    }
    pts.push(p);
  }
  return pts;
}
