import type { Mask, Pt } from '../types';

/** A shape described by how far it reaches in each of N directions from its centre. */
export type Outline = { c: Pt; r: number[] };

export function centroidOf(m: Mask): Pt {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) { sx += i % m.width; sy += (i / m.width) | 0; n++; }
  return n ? { x: sx / n, y: sy / n } : { x: m.width / 2, y: m.height / 2 };
}

/** Furthest filled pixel along each of n rays (0 = right, then clockwise in screen coordinates). */
export function outlineOf(m: Mask, c: Pt, n = 256): number[] {
  const r = new Array(n).fill(0);
  const maxR = Math.hypot(m.width, m.height);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d < maxR; d += 0.5) {
      const x = Math.floor(c.x + 0.5 + dx * d), y = Math.floor(c.y + 0.5 + dy * d);
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) break;
      if (m.data[y * m.width + x]) r[k] = d + 0.5;
    }
  }
  return r;
}

/** The in-between outline at k (0 = a, 1 = b), as polygon points. */
export function morphOutline(a: Outline, b: Outline, k: number): Pt[] {
  const n = a.r.length;
  const cx = a.c.x + (b.c.x - a.c.x) * k, cy = a.c.y + (b.c.y - a.c.y) * k;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2, rr = a.r[i] + (b.r[i] - a.r[i]) * k;
    pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
  }
  return pts;
}
