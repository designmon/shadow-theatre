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

  cat: { h: 0.74, strokes: [
    closed(join(
      bez([0.18, 0.36], [0.35, 0.28], [0.55, 0.3], [0.68, 0.3]),
      bez([0.68, 0.3], [0.72, 0.24], [0.73, 0.17], [0.74, 0.1]),
      seg([0.74, 0.1], [0.75, 0.02], [0.81, 0.1]),
      bez([0.81, 0.1], [0.84, 0.09], [0.87, 0.09], [0.89, 0.1]),
      seg([0.89, 0.1], [0.94, 0.02], [0.95, 0.15]),
      bez([0.95, 0.15], [0.99, 0.2], [0.99, 0.27], [0.93, 0.3]),
      bez([0.93, 0.3], [0.88, 0.34], [0.84, 0.36], [0.82, 0.42]),
      seg([0.82, 0.42], [0.81, 0.71], [0.75, 0.71], [0.74, 0.52]),
      bez([0.74, 0.52], [0.6, 0.55], [0.45, 0.55], [0.35, 0.51]),
      seg([0.35, 0.51], [0.34, 0.71], [0.28, 0.71]),
      bez([0.28, 0.71], [0.25, 0.6], [0.2, 0.5], [0.18, 0.36]),
    ).slice(0, -1)),
    open(join(bez([0.18, 0.36], [0.06, 0.34], [0.0, 0.2], [0.07, 0.08]), bez([0.07, 0.08], [0.11, 0.02], [0.17, 0.05], [0.14, 0.1]))),
    open(seg([0.69, 0.53], [0.69, 0.69])),
    open(seg([0.4, 0.53], [0.41, 0.69])),
    closed(ellipse(0.885, 0.19, 0.014, 0.02), true),
    open(seg([0.93, 0.26], [1.03, 0.24])),
    open(seg([0.93, 0.28], [1.03, 0.31])),
  ] },
  dog: { h: 0.74, strokes: [
    closed(join(
      bez([0.2, 0.32], [0.38, 0.3], [0.55, 0.3], [0.66, 0.3]),
      bez([0.66, 0.3], [0.7, 0.22], [0.72, 0.14], [0.78, 0.1]),
      bez([0.78, 0.1], [0.84, 0.06], [0.9, 0.08], [0.92, 0.14]),
      seg([0.92, 0.14], [1.0, 0.17]),
      bez([1.0, 0.17], [1.03, 0.21], [1.0, 0.26], [0.94, 0.26]),
      bez([0.94, 0.26], [0.88, 0.27], [0.84, 0.3], [0.82, 0.36]),
      bez([0.82, 0.36], [0.8, 0.42], [0.79, 0.46], [0.78, 0.5]),
      seg([0.78, 0.5], [0.78, 0.72], [0.71, 0.72], [0.71, 0.53]),
      bez([0.71, 0.53], [0.6, 0.56], [0.46, 0.56], [0.37, 0.53]),
      seg([0.37, 0.53], [0.36, 0.72], [0.29, 0.72]),
      bez([0.29, 0.72], [0.27, 0.6], [0.22, 0.48], [0.2, 0.32]),
    ).slice(0, -1)),
    closed(join(bez([0.8, 0.11], [0.73, 0.13], [0.71, 0.26], [0.74, 0.33]), bez([0.74, 0.33], [0.8, 0.31], [0.83, 0.2], [0.8, 0.11])).slice(0, -1), true),
    open(bez([0.2, 0.32], [0.12, 0.26], [0.1, 0.16], [0.15, 0.07])),
    open(seg([0.66, 0.55], [0.66, 0.7])),
    open(seg([0.43, 0.55], [0.44, 0.7])),
    closed(circle(0.88, 0.15, 0.014), true),
    closed(circle(0.995, 0.19, 0.018), true),
  ] },
  rabbit: { h: 0.95, strokes: [
    closed(join(bez([0.2, 0.93], [0.02, 0.86], [0.05, 0.5], [0.3, 0.46]), bez([0.3, 0.46], [0.5, 0.43], [0.62, 0.56], [0.62, 0.7]), bez([0.62, 0.7], [0.62, 0.82], [0.7, 0.88], [0.78, 0.93]), seg([0.78, 0.93], [0.2, 0.93])).slice(0, -1)),
    closed(ellipse(0.67, 0.37, 0.14, 0.12, -8)),
    closed(ellipse(0.6, 0.13, 0.05, 0.15, -16)),
    closed(ellipse(0.71, 0.11, 0.05, 0.15, 8)),
    open(bez([0.6, 0.06], [0.61, 0.1], [0.61, 0.16], [0.6, 0.22])),
    closed(circle(0.06, 0.78, 0.055)),
    closed(circle(0.72, 0.34, 0.016), true),
    closed(circle(0.8, 0.39, 0.012), true),
    open(bez([0.5, 0.72], [0.56, 0.8], [0.6, 0.88], [0.66, 0.93])),
  ] },
  bird: { h: 0.66, strokes: [
    // a round little bird in flight, facing right: head, beak, plump body, fanned tail, wing up
    closed(join(
      bez([0.86, 0.34], [0.86, 0.24], [0.78, 0.2], [0.72, 0.22]),
      bez([0.72, 0.22], [0.64, 0.24], [0.6, 0.32], [0.54, 0.38]),
      bez([0.54, 0.38], [0.44, 0.44], [0.32, 0.44], [0.22, 0.42]),
      seg([0.22, 0.42], [0.04, 0.34], [0.1, 0.46], [0.02, 0.52], [0.24, 0.52]),
      bez([0.24, 0.52], [0.36, 0.64], [0.62, 0.64], [0.76, 0.5]),
      bez([0.76, 0.5], [0.82, 0.45], [0.86, 0.4], [0.86, 0.34]),
    ).slice(0, -1)),
    closed(seg([0.85, 0.29], [0.97, 0.33], [0.85, 0.36])),
    closed(join(bez([0.6, 0.38], [0.6, 0.2], [0.5, 0.06], [0.3, 0.0]), bez([0.3, 0.0], [0.34, 0.14], [0.32, 0.28], [0.4, 0.42])).slice(0, -1)),
    open(bez([0.38, 0.08], [0.44, 0.16], [0.46, 0.26], [0.48, 0.36])),
    open(bez([0.33, 0.14], [0.37, 0.22], [0.38, 0.3], [0.42, 0.38])),
    closed(circle(0.78, 0.3, 0.018), true),
  ] },
  butterfly: { h: 0.9, strokes: [
    closed(join(bez([0.47, 0.34], [0.36, 0.0], [0.0, -0.02], [0.05, 0.27]), bez([0.05, 0.27], [0.09, 0.42], [0.32, 0.46], [0.47, 0.41])).slice(0, -1)),
    closed(join(bez([0.53, 0.34], [0.64, 0.0], [1.0, -0.02], [0.95, 0.27]), bez([0.95, 0.27], [0.91, 0.42], [0.68, 0.46], [0.53, 0.41])).slice(0, -1)),
    closed(join(bez([0.47, 0.44], [0.3, 0.46], [0.12, 0.6], [0.2, 0.77]), bez([0.2, 0.77], [0.28, 0.9], [0.44, 0.72], [0.48, 0.5])).slice(0, -1)),
    closed(join(bez([0.53, 0.44], [0.7, 0.46], [0.88, 0.6], [0.8, 0.77]), bez([0.8, 0.77], [0.72, 0.9], [0.56, 0.72], [0.52, 0.5])).slice(0, -1)),
    closed(ellipse(0.5, 0.46, 0.025, 0.2), true),
    closed(circle(0.23, 0.21, 0.05)),
    closed(circle(0.77, 0.21, 0.05)),
    open(bez([0.49, 0.28], [0.46, 0.16], [0.42, 0.08], [0.37, 0.04])),
    open(bez([0.51, 0.28], [0.54, 0.16], [0.58, 0.08], [0.63, 0.04])),
    closed(circle(0.37, 0.04, 0.012), true),
    closed(circle(0.63, 0.04, 0.012), true),
  ] },
  fish: { h: 0.6, strokes: [
    closed(join(bez([0.95, 0.32], [0.78, 0.04], [0.42, 0.04], [0.27, 0.32]), bez([0.27, 0.32], [0.42, 0.6], [0.78, 0.6], [0.95, 0.32])).slice(0, -1)),
    closed(join(bez([0.27, 0.32], [0.16, 0.2], [0.08, 0.14], [0.03, 0.1]), bez([0.03, 0.1], [0.08, 0.26], [0.08, 0.38], [0.03, 0.54]), bez([0.03, 0.54], [0.1, 0.48], [0.18, 0.42], [0.27, 0.32])).slice(0, -1)),
    open(bez([0.46, 0.1], [0.5, 0.0], [0.62, 0.0], [0.68, 0.09])),
    open(bez([0.62, 0.17], [0.57, 0.27], [0.57, 0.38], [0.62, 0.48])),
    open(bez([0.52, 0.42], [0.5, 0.5], [0.46, 0.54], [0.42, 0.55])),
    closed(circle(0.79, 0.26, 0.026), true),
    open(bez([0.86, 0.38], [0.89, 0.4], [0.92, 0.39], [0.94, 0.36])),
  ] },
  snake: { h: 0.46, strokes: [
    open(join(wave(0.02, 0.8, 0.28, 0.1, 1.5), bez([0.8, 0.28], [0.83, 0.2], [0.88, 0.17], [0.92, 0.18]))),
    closed(join(bez([0.86, 0.16], [0.9, 0.11], [0.98, 0.12], [1.0, 0.18]), bez([1.0, 0.18], [0.99, 0.23], [0.92, 0.25], [0.86, 0.21])).slice(0, -1)),
    open(seg([1.0, 0.19], [1.06, 0.18], [1.09, 0.15])),
    open(seg([1.06, 0.18], [1.09, 0.21])),
    closed(circle(0.95, 0.16, 0.012), true),
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

  plane: { h: 0.48, strokes: [
    closed(join(bez([0.05, 0.25], [0.05, 0.21], [0.08, 0.19], [0.14, 0.19]), seg([0.14, 0.19], [0.8, 0.19]), bez([0.8, 0.19], [0.92, 0.19], [1.0, 0.24], [1.0, 0.27]), bez([1.0, 0.27], [1.0, 0.3], [0.95, 0.32], [0.86, 0.32]), seg([0.86, 0.32], [0.12, 0.32]), bez([0.12, 0.32], [0.07, 0.32], [0.05, 0.29], [0.05, 0.25])).slice(0, -1)),
    closed(seg([0.1, 0.19], [0.04, 0.02], [0.12, 0.02], [0.25, 0.19])),
    closed(seg([0.4, 0.28], [0.29, 0.47], [0.38, 0.47], [0.59, 0.28])),
    open(seg([0.89, 0.22], [0.95, 0.24])),
    ...[0.3, 0.38, 0.46, 0.54, 0.62, 0.7].map((x) => closed(circle(x, 0.245, 0.012), true)),
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
