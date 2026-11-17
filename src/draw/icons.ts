import type { Pt } from '../types';

/**
 * Clean line drawings of everything a fingertip drawing can be recognised as: one ink weight,
 * minimal, facing right. In a box 1 wide and `h` tall (y down). When a drawing is recognised,
 * the clean version draws itself over the user's lines (Doodle).
 */
export type IconStroke = { pts: Pt[]; closed?: boolean; fill?: boolean };
export type Icon = { h: number; strokes: IconStroke[] };

type XY = [number, number];
const P = ([x, y]: XY): Pt => ({ x, y });
const rad = (d: number) => (d * Math.PI) / 180;

/** Ellipse arc (degrees, y down: 90 = bottom, -90 = top), optionally rotated. */
function arc(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = 360, rot = 0): Pt[] {
  const n = Math.max(8, Math.round((Math.abs(a1 - a0) / 360) * 48));
  const c = Math.cos(rad(rot)), s = Math.sin(rad(rot)), out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), x = rx * Math.cos(a), y = ry * Math.sin(a);
    out.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return out;
}
const circle = (cx: number, cy: number, r: number): Pt[] => arc(cx, cy, r, r).slice(0, -1);
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0): Pt[] => arc(cx, cy, rx, ry, 0, 360, rot).slice(0, -1);

/** Cubic Bézier. */
function bez(a: XY, b: XY, c: XY, d: XY, n = 18): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      y: u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    });
  }
  return out;
}
const seg = (...pts: XY[]): Pt[] => pts.map(P);
/** One continuous line from parts (drops the repeated joint). */
const join = (...parts: Pt[][]): Pt[] => parts.flatMap((p, i) => (i ? p.slice(1) : p));
const wave = (x0: number, x1: number, y: number, amp: number, waves: number): Pt[] =>
  Array.from({ length: 41 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / 40; return { x, y: y + amp * Math.sin(((x - x0) / (x1 - x0)) * waves * Math.PI * 2) }; });

const open = (pts: Pt[]): IconStroke => ({ pts });
const closed = (pts: Pt[], fill = false): IconStroke => ({ pts, closed: true, fill });

export const ICONS: Record<string, Icon> = {
  heart: { h: 0.88, strokes: [closed(join(
    bez([0.5, 0.86], [0.15, 0.6], [-0.02, 0.36], [0.12, 0.17]),
    bez([0.12, 0.17], [0.25, 0.0], [0.47, 0.04], [0.5, 0.25]),
    bez([0.5, 0.25], [0.53, 0.04], [0.75, 0.0], [0.88, 0.17]),
    bez([0.88, 0.17], [1.02, 0.36], [0.85, 0.6], [0.5, 0.86]),
  ).slice(0, -1), true)] },

  star: { h: 0.96, strokes: [closed(Array.from({ length: 10 }, (_, k) => {
    const a = rad(-90 + k * 36), r = k % 2 ? 0.2 : 0.5;
    return { x: 0.5 + r * Math.cos(a), y: 0.52 + r * Math.sin(a) };
  }))] },

  circle: { h: 1, strokes: [closed(circle(0.5, 0.5, 0.48))] },

  sun: { h: 1, strokes: [
    closed(circle(0.5, 0.5, 0.22)),
    ...Array.from({ length: 8 }, (_, k) => { const a = rad(k * 45); return open([{ x: 0.5 + 0.31 * Math.cos(a), y: 0.5 + 0.31 * Math.sin(a) }, { x: 0.5 + 0.46 * Math.cos(a), y: 0.5 + 0.46 * Math.sin(a) }]); }),
  ] },

  moon: { h: 1, strokes: [closed(join(arc(0.5, 0.5, 0.45, 0.45, 50, 310), bez([0.789, 0.155], [0.45, 0.27], [0.45, 0.73], [0.789, 0.845])).slice(0, -1))] },

  cloud: { h: 0.6, strokes: [closed(join(
    seg([0.3, 0.52], [0.84, 0.52]),
    arc(0.82, 0.4, 0.13, 0.12, 90, -80),
    arc(0.58, 0.28, 0.2, 0.19, -10, -175),
    arc(0.3, 0.38, 0.15, 0.14, -60, -270),
  ))] },

  flower: { h: 1.3, strokes: [
    closed(circle(0.5, 0.35, 0.08)),
    ...Array.from({ length: 6 }, (_, k) => { const a = k * 60; return closed(ellipse(0.5 + 0.2 * Math.cos(rad(a)), 0.35 + 0.2 * Math.sin(rad(a)), 0.12, 0.07, a)); }),
    open(bez([0.5, 0.62], [0.48, 0.85], [0.52, 1.05], [0.5, 1.28])),
    closed(join(bez([0.5, 1.0], [0.6, 0.86], [0.74, 0.86], [0.8, 0.9]), bez([0.8, 0.9], [0.72, 1.0], [0.6, 1.03], [0.5, 1.0])).slice(0, -1)),
  ] },

  tree: { h: 1.2, strokes: [
    closed(Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, r = 0.36 * (1 + 0.07 * Math.sin(7 * a)); return { x: 0.5 + r * Math.cos(a), y: 0.42 + r * Math.sin(a) }; })),
    open(seg([0.44, 1.18], [0.45, 0.78])),
    open(seg([0.56, 1.18], [0.55, 0.78])),
  ] },

  cat: { h: 0.76, strokes: [
    closed(join(bez([0.25, 0.35], [0.4, 0.28], [0.6, 0.28], [0.72, 0.33]), bez([0.72, 0.33], [0.8, 0.45], [0.78, 0.55], [0.7, 0.58]), seg([0.7, 0.58], [0.28, 0.58]), bez([0.28, 0.58], [0.15, 0.55], [0.15, 0.4], [0.25, 0.35])).slice(0, -1)),
    closed(circle(0.8, 0.25, 0.11)),
    open(seg([0.72, 0.19], [0.73, 0.05], [0.8, 0.15])),
    open(seg([0.83, 0.14], [0.9, 0.04], [0.9, 0.19])),
    open(seg([0.9, 0.28], [1.0, 0.26])),
    open(seg([0.9, 0.31], [1.0, 0.33])),
    open(bez([0.2, 0.4], [0.04, 0.36], [0.0, 0.15], [0.1, 0.05])),
    open(seg([0.32, 0.58], [0.3, 0.75])), open(seg([0.4, 0.58], [0.41, 0.75])),
    open(seg([0.6, 0.58], [0.59, 0.75])), open(seg([0.68, 0.57], [0.7, 0.75])),
  ] },

  dog: { h: 0.76, strokes: [
    closed(join(bez([0.22, 0.32], [0.4, 0.27], [0.58, 0.27], [0.7, 0.3]), bez([0.7, 0.3], [0.78, 0.42], [0.76, 0.55], [0.68, 0.57]), seg([0.68, 0.57], [0.25, 0.57]), bez([0.25, 0.57], [0.13, 0.55], [0.12, 0.38], [0.22, 0.32])).slice(0, -1)),
    closed(circle(0.8, 0.24, 0.11)),
    open(join(seg([0.88, 0.19], [0.99, 0.23]), bez([0.99, 0.23], [1.0, 0.29], [0.96, 0.32], [0.89, 0.31]))),
    closed(join(bez([0.74, 0.15], [0.65, 0.17], [0.63, 0.32], [0.68, 0.38]), bez([0.68, 0.38], [0.74, 0.34], [0.77, 0.24], [0.74, 0.15])).slice(0, -1), true),
    open(bez([0.2, 0.33], [0.12, 0.25], [0.1, 0.15], [0.14, 0.05])),
    open(seg([0.3, 0.57], [0.29, 0.75])), open(seg([0.38, 0.57], [0.39, 0.75])),
    open(seg([0.6, 0.57], [0.59, 0.75])), open(seg([0.67, 0.56], [0.69, 0.75])),
  ] },

  rabbit: { h: 0.92, strokes: [
    closed(ellipse(0.45, 0.68, 0.3, 0.21)),
    closed(circle(0.76, 0.46, 0.13)),
    closed(ellipse(0.71, 0.19, 0.05, 0.16, -12)),
    closed(ellipse(0.83, 0.18, 0.05, 0.16, 14)),
    closed(circle(0.13, 0.62, 0.06)),
    closed(circle(0.8, 0.44, 0.015), true),
  ] },

  bird: { h: 0.5, strokes: [
    open(bez([0.0, 0.3], [0.15, 0.04], [0.36, 0.04], [0.48, 0.36])),
    open(bez([0.52, 0.36], [0.64, 0.04], [0.85, 0.04], [1.0, 0.3])),
    closed(ellipse(0.5, 0.4, 0.05, 0.045), true),
  ] },

  butterfly: { h: 0.86, strokes: [
    open(seg([0.5, 0.25], [0.5, 0.76])),
    closed(ellipse(0.3, 0.3, 0.2, 0.16, -20)),
    closed(ellipse(0.7, 0.3, 0.2, 0.16, 20)),
    closed(ellipse(0.35, 0.62, 0.13, 0.11, 20)),
    closed(ellipse(0.65, 0.62, 0.13, 0.11, -20)),
    open(bez([0.5, 0.25], [0.47, 0.12], [0.42, 0.06], [0.37, 0.03])),
    open(bez([0.5, 0.25], [0.53, 0.12], [0.58, 0.06], [0.63, 0.03])),
  ] },

  fish: { h: 0.56, strokes: [
    closed(join(bez([0.95, 0.28], [0.78, 0.0], [0.42, 0.0], [0.27, 0.28]), bez([0.27, 0.28], [0.42, 0.56], [0.78, 0.56], [0.95, 0.28])).slice(0, -1)),
    closed(seg([0.27, 0.28], [0.04, 0.08], [0.04, 0.48])),
    closed(circle(0.78, 0.22, 0.025), true),
    open(bez([0.6, 0.12], [0.55, 0.22], [0.55, 0.34], [0.6, 0.44])),
  ] },

  snake: { h: 0.46, strokes: [
    open(join(wave(0.02, 0.84, 0.28, 0.11, 1.5), bez([0.84, 0.28], [0.88, 0.2], [0.95, 0.18], [0.98, 0.22]))),
    open(seg([0.98, 0.22], [1.03, 0.2])),
    closed(circle(0.92, 0.2, 0.012), true),
  ] },

  turtle: { h: 0.58, strokes: [
    closed(join(arc(0.48, 0.42, 0.32, 0.3, 180, 360), seg([0.8, 0.42], [0.16, 0.42]))),
    open(seg([0.33, 0.42], [0.38, 0.24], [0.58, 0.24], [0.63, 0.42])),
    closed(circle(0.89, 0.36, 0.07)),
    open(seg([0.25, 0.42], [0.22, 0.55])), open(seg([0.38, 0.42], [0.37, 0.55])),
    open(seg([0.6, 0.42], [0.61, 0.55])), open(seg([0.72, 0.42], [0.75, 0.55])),
    open(seg([0.16, 0.42], [0.07, 0.46])),
  ] },

  house: { h: 1, strokes: [
    closed(seg([0.2, 0.46], [0.8, 0.46], [0.8, 0.96], [0.2, 0.96])),
    open(seg([0.1, 0.5], [0.5, 0.1], [0.9, 0.5])),
    open(seg([0.43, 0.96], [0.43, 0.72], [0.57, 0.72], [0.57, 0.96])),
    closed(seg([0.27, 0.56], [0.37, 0.56], [0.37, 0.66], [0.27, 0.66])),
    open(seg([0.68, 0.3], [0.68, 0.16], [0.76, 0.16], [0.76, 0.38])),
  ] },

  face: { h: 1, strokes: [
    closed(circle(0.5, 0.5, 0.46)),
    closed(ellipse(0.36, 0.4, 0.035, 0.05), true),
    closed(ellipse(0.64, 0.4, 0.035, 0.05), true),
    open(arc(0.5, 0.52, 0.22, 0.2, 25, 155)),
  ] },

  person: { h: 1.6, strokes: [
    closed(circle(0.5, 0.17, 0.14)),
    open(seg([0.5, 0.31], [0.5, 0.95])),
    open(seg([0.14, 0.58], [0.5, 0.45], [0.86, 0.58])),
    open(seg([0.22, 1.56], [0.5, 0.95], [0.78, 1.56])),
  ] },

  car: { h: 0.5, strokes: [
    closed(seg([0.04, 0.38], [0.04, 0.26], [0.2, 0.23], [0.32, 0.08], [0.66, 0.08], [0.8, 0.23], [0.96, 0.27], [0.96, 0.38])),
    open(seg([0.22, 0.23], [0.8, 0.23])),
    open(seg([0.51, 0.08], [0.51, 0.23])),
    closed(circle(0.26, 0.39, 0.09)),
    closed(circle(0.74, 0.39, 0.09)),
  ] },

  boat: { h: 0.92, strokes: [
    closed(seg([0.05, 0.6], [0.95, 0.6], [0.78, 0.8], [0.22, 0.8])),
    open(seg([0.5, 0.6], [0.5, 0.04])),
    closed(seg([0.54, 0.08], [0.54, 0.54], [0.9, 0.54])),
    closed(seg([0.46, 0.14], [0.46, 0.54], [0.18, 0.54])),
    open(seg([0.5, 0.04], [0.38, 0.08], [0.5, 0.12])),
    open(wave(0.0, 1.0, 0.89, 0.025, 4)),
  ] },

  plane: { h: 0.46, strokes: [
    closed(join(seg([0.06, 0.18], [0.82, 0.18]), bez([0.82, 0.18], [0.95, 0.18], [1.0, 0.24], [0.96, 0.28]), seg([0.96, 0.28], [0.12, 0.3]), bez([0.12, 0.3], [0.07, 0.3], [0.05, 0.24], [0.06, 0.18])).slice(0, -1)),
    closed(seg([0.08, 0.18], [0.04, 0.02], [0.14, 0.02], [0.26, 0.18])),
    closed(seg([0.44, 0.26], [0.3, 0.44], [0.4, 0.44], [0.62, 0.26])),
    open(seg([0.68, 0.21], [0.86, 0.21])),
  ] },
};

/** The clean drawing for `what`, fitted over a drawing with this box (centre cx,cy; size w x h). */
export function fitIcon(what: string, box: { cx: number; cy: number; w: number; h: number }): IconStroke[] | null {
  const icon = ICONS[what];
  if (!icon) return null;
  const w = Math.max(box.w, 1), h = Math.max(box.h, 1);
  // about as big as what was drawn (same area), never tiny for a thin scribble
  const s = Math.max(Math.sqrt((w * h) / icon.h), 0.6 * Math.max(w, h / icon.h));
  return icon.strokes.map((st) => ({ ...st, pts: st.pts.map((p) => ({ x: box.cx + (p.x - 0.5) * s, y: box.cy + (p.y - icon.h / 2) * s })) }));
}
