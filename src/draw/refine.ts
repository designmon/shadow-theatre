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
 * Blur along the line's length (Gaussian, sigma px): removes tremor (short wavelength) while small
 * shapes survive — a circle of radius 15 px keeps 95% of its size at sigma 5.
 */
export function smoothAlong(pts: Pt[], sigma = 5, step = 2): Pt[] {
  if (pts.length < 3) return pts;
  // evenly spaced along the line
  const even: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    let at = step - carry;
    while (at <= d) { even.push({ x: a.x + ((b.x - a.x) * at) / d, y: a.y + ((b.y - a.y) * at) / d }); at += step; }
    carry = d - (at - step);
  }
  even.push(pts[pts.length - 1]);
  const r = Math.ceil((2.5 * sigma) / step), w: number[] = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-((k * step) ** 2) / (2 * sigma * sigma)));
  const n = even.length;
  return even.map((_, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (let k = -r; k <= r; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k)); // the ends stay where they are
      sx += even[j].x * w[k + r]; sy += even[j].y * w[k + r]; sw += w[k + r];
    }
    return { x: sx / sw, y: sy / sw };
  });
}

/**
 * The finished line, refined: tremor blurred away along the line, then simplified a little, corners rounded (Chaikin).
 * A line whose end comes back near its start becomes a closed shape.
 */
export function refineStroke(drawn: Pt[]): { points: Pt[]; closed: boolean } {
  const raw = smoothAlong(drawn);
  const xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const a = raw[0], z = raw[raw.length - 1];
  const closed = raw.length > 6 && Math.hypot(a.x - z.x, a.y - z.y) < size * 0.2;
  const eps = Math.max(2.5, size * 0.012); // gentle: small details (eyes, little circles) survive
  let simple: Pt[];
  if (closed) {
    // a loop: split at the point farthest from the start, simplify both halves (start == end breaks RDP)
    let m = 0, d = -1;
    raw.forEach((p, i) => { const q = Math.hypot(p.x - a.x, p.y - a.y); if (q > d) { d = q; m = i; } });
    simple = [...simplify(raw.slice(0, m + 1), eps).slice(0, -1), ...simplify(raw.slice(m), eps)];
  } else simple = simplify(raw, eps);
  const pts = closed ? simple.slice(0, -1) : simple;
  return { points: chaikin(pts, 3, closed), closed };
}
