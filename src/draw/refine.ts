import type { Pt } from '../types';

/** Ramer-Douglas-Peucker: drop points that don't change the shape by more than eps. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [a, b];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

/** Chaikin corner cutting: each pass rounds every corner a little. */
function chaikin(pts: Pt[], passes: number, closed: boolean): Pt[] {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const out: Pt[] = closed ? [] : [p[0]];
    const n = closed ? p.length : p.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/**
 * The finished line, refined: wobbles removed (simplify), corners rounded (Chaikin).
 * A line whose end comes back near its start becomes a closed shape.
 */
export function refineStroke(raw: Pt[]): { points: Pt[]; closed: boolean } {
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const a = raw[0], z = raw[raw.length - 1];
  const closed = raw.length > 6 && Math.hypot(a.x - z.x, a.y - z.y) < size * 0.2;
  const eps = Math.max(4, size * 0.032); // a little more: wobbles from a hand in the air smooth out
  let simple: Pt[];
  if (closed) {
    // a loop: split at the point farthest from the start, simplify both halves (start == end breaks RDP)
    let m = 0, d = -1;
    raw.forEach((p, i) => { const q = Math.hypot(p.x - a.x, p.y - a.y); if (q > d) { d = q; m = i; } });
    simple = [...simplify(raw.slice(0, m + 1), eps).slice(0, -1), ...simplify(raw.slice(m), eps)];
  } else simple = simplify(raw, eps);
  const pts = closed ? simple.slice(0, -1) : simple;
  return { points: chaikin(pts, 4, closed), closed };
}
