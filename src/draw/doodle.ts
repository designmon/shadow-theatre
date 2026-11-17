import { applyShadowStyle } from '../creatures/style';

const INK = '#111';
const INK_W = 7; // matches the pen's settled ink (render.ts)
import type { Creature } from '../creatures/types';
import type { Box, Mask, Pt } from '../types';
import { refineStroke } from './refine';

/** How a drawing comes alive. */
export const MOTIONS = ['fly', 'swim', 'slither', 'hop', 'walk', 'sway', 'float', 'beat', 'twinkle', 'spin'] as const;
export type Motion = (typeof MOTIONS)[number];

/** The motion that fits the thing; the model's motion guess only for things we don't know. */
const BY_THING: Record<string, Motion> = {
  heart: 'beat', star: 'twinkle', sun: 'spin', moon: 'float', cloud: 'float', circle: 'float',
  cat: 'walk', dog: 'walk', horse: 'walk', person: 'walk', turtle: 'walk', house: 'float', car: 'walk',
  bird: 'fly', butterfly: 'fly', bee: 'fly', plane: 'fly', fish: 'swim', boat: 'swim', whale: 'swim',
  snake: 'slither', worm: 'slither', rabbit: 'hop', frog: 'hop', flower: 'sway', tree: 'sway', face: 'float',
};
export function motionFor(what: string, guess: Motion): Motion {
  return BY_THING[what] ?? guess;
}

const SETTLE_MS = 700; // the raw line melts into the refined one
const BEAUTIFY_MS = 700; // a heart / star / circle eases toward its ideal shape
const WAKE_MS = 900; // motion eases in
const PERFORM_MS = 4000; // a little performance, then it goes to rest in its place
const MOVE_MS = 1700; // walking to its place / back up
const LABEL_MS = 2200;
const RETIRE_MS = 1500;

type Stroke = { raw: Pt[]; base: Pt[]; closed: boolean; ideal: Pt[] | null };

function resample(pts: Pt[], n: number, closed: boolean): Pt[] {
  const path = closed ? [...pts, pts[0]] : pts;
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const total = seg[seg.length - 1] || 1, out: Pt[] = [];
  for (let k = 0, j = 1; k < n; k++) {
    const d = (k / (closed ? n : Math.max(1, n - 1))) * total;
    while (j < seg.length - 1 && seg[j] < d) j++;
    const a = path[j - 1], b = path[Math.min(j, path.length - 1)], f = (d - seg[j - 1]) / Math.max(1e-6, seg[j] - seg[j - 1]);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/** Ideal shapes in a unit box (closed outlines), for gentle beautifying. */
function idealShape(kind: string, n: number): Pt[] | null {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    if (kind === 'heart') pts.push({ x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) });
    else if (kind === 'circle' || kind === 'sun' || kind === 'moon') pts.push({ x: Math.cos(t), y: Math.sin(t) });
    else if (kind === 'star') {
      const k = (i / n) * 10, j = Math.floor(k), f = k - j;
      const at = (q: number) => { const a = -Math.PI / 2 + (q / 10) * Math.PI * 2, r = q % 2 ? 0.42 : 1; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; };
      const A = at(j), B = at(j + 1);
      pts.push({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f });
    } else return null;
  }
  return pts;
}

/** Fit an ideal shape onto a stroke's box, starting near the stroke's own start point. */
function fitIdeal(kind: string, base: Pt[]): Pt[] | null {
  const ideal = idealShape(kind, base.length);
  if (!ideal) return null;
  const bx = base.map((p) => p.x), by = base.map((p) => p.y), ix = ideal.map((p) => p.x), iy = ideal.map((p) => p.y);
  const sx = (Math.max(...bx) - Math.min(...bx)) / (Math.max(...ix) - Math.min(...ix) || 1);
  const sy = (Math.max(...by) - Math.min(...by)) / (Math.max(...iy) - Math.min(...iy) || 1);
  const cx = (Math.max(...bx) + Math.min(...bx)) / 2, cy = (Math.max(...by) + Math.min(...by)) / 2;
  const icx = (Math.max(...ix) + Math.min(...ix)) / 2, icy = (Math.max(...iy) + Math.min(...iy)) / 2;
  const fitted = ideal.map((p) => ({ x: cx + (p.x - icx) * sx, y: cy + (p.y - icy) * sy }));
  // same direction of travel and start point as the drawing
  const area = (pts: Pt[]) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0);
  if (Math.sign(area(fitted)) !== Math.sign(area(base))) fitted.reverse();
  let best = 0, bd = Infinity;
  fitted.forEach((p, i) => { const d = Math.hypot(p.x - base[0].x, p.y - base[0].y); if (d < bd) { bd = d; best = i; } });
  return [...fitted.slice(best), ...fitted.slice(0, best)];
}

/**
 * A drawing made with the fingertip pen: appears as drawn, settles into a refined line, is
 * named and (for simple shapes) gently beautified, performs its motion for a few seconds near
 * where it was drawn, then walks to its place in the row along the bottom and rests there.
 * Pointing at it wakes it to perform again.
 */
export class Doodle implements Creature {
  kind = 'unknown' as const;
  private strokes: Stroke[];
  private home: Pt;
  private size: number;
  private motion: Motion | null = null;
  private label = '';
  private t = 0;
  private aliveAt = Infinity;
  private beautifyAt = Infinity;
  private phase: 'drawn' | 'performing' | 'toPark' | 'parked' | 'toStage' = 'drawn';
  private phaseAt = 0;
  private slot: Pt | null = null;
  private slotScale = 0.4;
  private facing = 1;
  private retireAt: number | null = null;
  private fade = 1;

  constructor(drawn: Pt[][], private wall: { w: number; h: number }) {
    const prepared = drawn.filter((s) => s.length >= 2).map((s) => {
      const r = refineStroke(s);
      const n = Math.max(24, Math.min(240, r.points.length));
      return { base: resample(r.points, n, r.closed), raw: resample(s, n, false), closed: r.closed };
    });
    const all = prepared.flatMap((s) => s.base);
    const c = { x: all.reduce((s, p) => s + p.x, 0) / all.length, y: all.reduce((s, p) => s + p.y, 0) / all.length };
    this.home = c;
    this.strokes = prepared.map((s) => ({
      base: s.base.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
      raw: s.raw.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
      closed: s.closed,
      ideal: null,
    }));
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    this.size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 20);
  }

  get done(): boolean {
    return this.retireAt !== null && this.t - this.retireAt >= RETIRE_MS;
  }
  get retiring(): boolean {
    return this.retireAt !== null;
  }
  /** How big the drawing is (px), to fit it into its resting place. */
  get drawnSize(): number {
    return this.size;
  }

  get parked(): boolean {
    return this.phase === 'parked';
  }
  retire(): void {
    if (this.retireAt === null) this.retireAt = this.t;
  }

  /** It knows what it is: beautify simple shapes, show its name, start performing. */
  comeAlive(motion: Motion, label = ''): void {
    this.motion = motion;
    this.label = label;
    this.aliveAt = Math.max(this.t, SETTLE_MS);
    this.beautifyAt = this.aliveAt;
    if (this.strokes.length === 1 && this.strokes[0].closed) this.strokes[0].ideal = fitIdeal(label, this.strokes[0].base);
    this.phase = 'performing';
    this.phaseAt = this.aliveAt;
  }

  /** Where it rests after performing (its place in the row), and how small. */
  park(slot: Pt, scale: number): void {
    this.slot = { ...slot };
    this.slotScale = scale;
  }

  /** Pointed at while resting: come back up and perform again. */
  wake(): void {
    if (this.phase !== 'parked') return;
    this.phase = 'toStage';
    this.phaseAt = this.t;
  }

  hit(p: Pt): boolean {
    const b = this.box(), pad = 40;
    return p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
  }

  box(): Box {
    const pts = this.points().flat();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  update(dtMs: number): void {
    this.t += dtMs;
    if (this.retireAt !== null) this.fade = Math.max(0, 1 - (this.t - this.retireAt) / RETIRE_MS);
    const since = this.t - this.phaseAt;
    if (this.phase === 'performing' && this.slot && since > PERFORM_MS) { this.phase = 'toPark'; this.phaseAt = this.t; }
    else if (this.phase === 'toPark' && since > MOVE_MS) { this.phase = 'parked'; this.phaseAt = this.t; }
    else if (this.phase === 'toStage' && since > MOVE_MS) { this.phase = 'performing'; this.phaseAt = this.t; }
  }

  /** Centre and scale right now: on stage, resting in its slot, or on the way between. */
  private placement(): { c: Pt; scale: number; energy: number } {
    const since = this.t - this.phaseAt, k = Math.min(1, since / MOVE_MS), e = k * k * (3 - 2 * k);
    const slot = this.slot ?? this.home, s = this.slotScale;
    if (this.phase === 'toPark') return { c: { x: this.home.x + (slot.x - this.home.x) * e, y: this.home.y + (slot.y - this.home.y) * e }, scale: 1 + (s - 1) * e, energy: 1 };
    if (this.phase === 'parked') return { c: slot, scale: s, energy: 0.3 };
    if (this.phase === 'toStage') return { c: { x: slot.x + (this.home.x - slot.x) * e, y: slot.y + (this.home.y - slot.y) * e }, scale: s + (1 - s) * e, energy: 1 };
    return { c: this.home, scale: 1, energy: 1 };
  }

  /** Small loops and paces around its spot while performing. */
  private offset(t: number, amount: number): Pt {
    const s = this.size, m = this.motion;
    const a = (period: number) => (t / period) * Math.PI * 2;
    let o = { x: 0, y: 0 };
    if (m === 'fly') o = { x: Math.sin(a(5000)) * s * 0.6, y: Math.sin(2 * a(5000)) * s * 0.25 };
    if (m === 'swim') o = { x: Math.sin(a(6000)) * s * 0.7, y: Math.sin(2 * a(6000)) * s * 0.2 };
    if (m === 'slither' || m === 'walk') o = { x: Math.sin(a(this.label === 'cat' ? 7000 : 5500)) * s * 0.7, y: 0 };
    if (m === 'hop') o = { x: Math.sin(a(6000)) * s * 0.5, y: -Math.max(0, Math.sin(((t / 800) % 1) * Math.PI)) * s * 0.3 };
    if (m === 'float') o = { x: Math.sin(t / 2300) * s * 0.06, y: Math.sin(t / 1700) * s * 0.08 };
    return { x: o.x * amount, y: o.y * amount };
  }

  /** The drawing's strokes right now. */
  points(): Pt[][] {
    const settle = Math.min(1, this.t / SETTLE_MS), se = settle * settle * (3 - 2 * settle);
    const bk = Math.min(1, Math.max(0, (this.t - this.beautifyAt) / BEAUTIFY_MS)), be = bk * bk * (3 - 2 * bk) * 0.6;
    const m = this.motion, t = Math.max(0, this.t - this.aliveAt), s = this.size;
    const { c, scale: place, energy } = this.placement();
    const wake = (m ? Math.min(1, t / WAKE_MS) : 0) * energy;
    const performing = this.phase === 'performing' ? wake : 0; // it only roams its spot while on stage
    const o = this.offset(t, performing);
    const ahead = this.offset(t + 120, performing);
    if (Math.abs(ahead.x - o.x) > 0.3) this.facing = ahead.x > o.x ? 1 : -1;
    if (this.phase === 'toPark' || this.phase === 'toStage') { const target = this.phase === 'toPark' ? this.slot ?? c : this.home; this.facing = target.x >= c.x ? 1 : -1; }
    const flips = m === 'walk' || m === 'swim' || m === 'fly' || m === 'hop' || m === 'slither';
    const flip = flips ? this.facing : 1;
    const bouncy = this.label === 'dog' ? 1.4 : this.label === 'cat' ? 0.6 : 1;
    let rot = 0, scale = place, sx = 1, sy = 1, bob = 0;
    if (m === 'walk') { rot = Math.sin(t / (this.label === 'cat' ? 230 : 160)) * 0.08 * wake; bob = -Math.abs(Math.sin(t / 160)) * s * 0.04 * bouncy * wake; }
    if (m === 'float') rot = Math.sin(t / 1900) * 0.07 * wake;
    if (m === 'sway') rot = Math.sin(t / 900) * 0.13 * wake;
    if (m === 'spin') rot = (t / 7000) * Math.PI * 2 * Math.max(wake, 0.3);
    if (m === 'beat') { const b = (t / (energy < 1 ? 1400 : 1000)) % 1; scale *= 1 + (Math.exp(-((b - 0.1) ** 2) / 0.002) * 0.12 + Math.exp(-((b - 0.3) ** 2) / 0.002) * 0.08) * Math.max(wake, 0.3); }
    if (m === 'twinkle') { scale *= 1 + Math.sin(t / 260) * 0.06 * Math.max(wake, 0.3); rot = Math.sin(t / 1300) * 0.08 * wake; }
    if (m === 'hop') { const ph = (t / 800) % 1, land = Math.max(0, 1 - Math.abs(ph - 0.98) * 12); sy = 1 - 0.12 * land * performing; sx = 1 + 0.08 * land * performing; }
    if (this.phase === 'parked') scale *= 1 + Math.sin(this.t / 1200) * 0.015; // resting: a gentle breath
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivotY = m === 'sway' ? Math.max(...this.strokes.flatMap((st) => st.base.map((p) => p.y))) : 0;
    return this.strokes.map((st) => st.base.map((b0, i) => {
      const r = st.raw[i];
      const ideal = st.ideal?.[i];
      const bx = ideal ? b0.x + (ideal.x - b0.x) * be : b0.x, by = ideal ? b0.y + (ideal.y - b0.y) * be : b0.y;
      let x = r.x + (bx - r.x) * se, y = r.y + (by - r.y) * se;
      x *= flip;
      if (m === 'fly') x *= 1 - (1 - Math.abs(Math.cos(t / 150))) * 0.6 * wake;
      if (m === 'swim') y += Math.sin((x / s) * Math.PI * 2 - t / 200) * s * 0.06 * wake;
      if (m === 'slither') y += Math.sin((x / s) * Math.PI * 3 - t / 260) * s * 0.11 * wake;
      x *= sx * scale; y *= sy * scale;
      const ry = y - pivotY * scale;
      return { x: c.x + o.x + x * cos - ry * sin, y: c.y + o.y + pivotY * scale + x * sin + ry * cos + bob };
    }));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.done) return;
    const strokes = this.points();
    const { scale } = this.placement();
    ctx.save();
    applyShadowStyle(ctx, this.fade);
    ctx.filter = 'none'; // crisp ink, exactly like the line you drew — not a blurry shadow
    ctx.fillStyle = ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3.5, INK_W * Math.sqrt(scale)); // same weight as the pen's ink; a little lighter at rest
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const fillOne = strokes.length === 1 && this.strokes[0].closed;
    for (const pts of strokes) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (fillOne) { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
    }
    if (this.motion === 'walk' && this.phase !== 'parked' && this.t > this.aliveAt) {
      const b = this.box(), t = this.t - this.aliveAt;
      for (const [k, ph] of [[0.35, 0], [0.65, Math.PI]] as const) {
        const x = b.x + b.w * k, y = b.y + b.h, a = Math.sin(t / 160 + ph) * 0.5;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + Math.sin(a) * this.size * 0.14 * scale, y + Math.cos(a) * this.size * 0.14 * scale); ctx.stroke();
      }
    }
    ctx.restore();
    // its name, briefly, in small light type
    const lt = this.t - this.aliveAt;
    if (this.label && this.label !== 'something' && lt > 0 && lt < LABEL_MS) {
      const b = this.box(), a = Math.min(1, lt / 300) * Math.min(1, (LABEL_MS - lt) / 500);
      ctx.save();
      ctx.filter = 'none';
      ctx.globalAlpha = a * this.fade;
      ctx.fillStyle = '#1d1d1f';
      ctx.font = `300 ${Math.round(20 * devicePixelRatioSafe())}px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.letterSpacing = '0.12em';
      ctx.fillText(this.label.toUpperCase(), b.x + b.w / 2, b.y + b.h + 40 * devicePixelRatioSafe());
      ctx.restore();
    }
  }

  darkMask(w: number, h: number): Mask {
    const out: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    if (this.fade < 0.5) return out;
    for (const p of this.points().flat()) {
      const x = Math.round(p.x), y = Math.round(p.y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) out.data[Y * w + X] = 1;
      }
    }
    return out;
  }
}

function devicePixelRatioSafe(): number {
  return typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
}
