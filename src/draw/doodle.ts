import { applyShadowStyle } from '../creatures/style';
import type { Creature } from '../creatures/types';
import type { Box, Mask, Pt } from '../types';
import { refineStroke } from './refine';

/** How a drawing comes alive — chosen by recognition, so anything you draw can move. */
export const MOTIONS = ['fly', 'swim', 'slither', 'hop', 'walk', 'sway', 'float', 'beat', 'twinkle', 'spin'] as const;
export type Motion = (typeof MOTIONS)[number];

const SETTLE_MS = 700; // the raw line melts into the refined one
const WAKE_MS = 1200; // motion eases in, so you see it wake up
const RETIRE_MS = 1500;

/** Resample a polyline to n points evenly spaced along its length. */
function resample(pts: Pt[], n: number, closed: boolean): Pt[] {
  const path = closed ? [...pts, pts[0]] : pts;
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const total = seg[seg.length - 1] || 1, out: Pt[] = [];
  for (let k = 0, j = 1; k < n; k++) {
    const d = (k / (closed ? n : n - 1)) * total;
    while (j < seg.length - 1 && seg[j] < d) j++;
    const a = path[j - 1], b = path[j], f = (d - seg[j - 1]) / Math.max(1e-6, seg[j] - seg[j - 1]);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/**
 * A drawing made with the fingertip pen. It appears as drawn, settles into a refined line, and
 * once it knows how it moves it comes alive near where it was drawn: no roaming, no leaving.
 */
export class Doodle implements Creature {
  kind = 'unknown' as const;
  private raw: Pt[]; // relative to the centre, resampled
  private base: Pt[]; // refined, relative to the centre
  private closed: boolean;
  private home: Pt;
  private size: number;
  private motion: Motion | null = null;
  private t = 0;
  private aliveAt = 0;
  private facing = 1;
  private retireAt: number | null = null;
  private fade = 1;

  constructor(stroke: Pt[], private wall: { w: number; h: number }) {
    const refined = refineStroke(stroke);
    this.closed = refined.closed;
    const n = Math.max(48, Math.min(240, refined.points.length));
    const smooth = resample(refined.points, n, refined.closed);
    const rough = resample(stroke, n, false);
    const c = { x: 0, y: 0 };
    for (const p of smooth) { c.x += p.x; c.y += p.y; }
    c.x /= n; c.y /= n;
    this.home = c;
    this.base = smooth.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    this.raw = rough.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const xs = this.base.map((p) => p.x), ys = this.base.map((p) => p.y);
    this.size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 20);
  }

  get done(): boolean {
    return this.retireAt !== null && this.t - this.retireAt >= RETIRE_MS;
  }

  get retiring(): boolean {
    return this.retireAt !== null;
  }

  retire(): void {
    if (this.retireAt === null) this.retireAt = this.t;
  }

  box(): Box {
    const pts = this.points();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  comeAlive(motion: Motion): void {
    this.motion = motion;
    this.aliveAt = Math.max(this.t, SETTLE_MS);
  }

  update(dtMs: number): void {
    this.t += dtMs;
    if (this.retireAt !== null) this.fade = Math.max(0, 1 - (this.t - this.retireAt) / RETIRE_MS);
  }

  /** Where it is, relative to home: small loops and paces around the spot it was drawn. */
  private offset(t: number, wake: number): Pt {
    const s = this.size, m = this.motion;
    const loop = (period: number, rx: number, ry: number) => {
      const a = (t / period) * Math.PI * 2;
      return { x: Math.sin(a) * rx, y: Math.sin(2 * a) * ry };
    };
    let o = { x: 0, y: 0 };
    if (m === 'fly') o = loop(7000, s * 0.7, s * 0.3);
    if (m === 'swim') o = loop(9000, s * 0.8, s * 0.25);
    if (m === 'slither') o = { x: Math.sin((t / 8000) * Math.PI * 2) * s * 0.7, y: 0 };
    if (m === 'walk') o = { x: Math.sin((t / 9000) * Math.PI * 2) * s * 0.8, y: 0 };
    if (m === 'hop') { const ph = (t / 900) % 1; o = { x: Math.sin((t / 9000) * Math.PI * 2) * s * 0.6, y: -Math.max(0, Math.sin(ph * Math.PI)) * s * 0.35 }; }
    if (m === 'float') o = { x: Math.sin(t / 2300) * s * 0.08, y: Math.sin(t / 1700) * s * 0.1 };
    return { x: o.x * wake, y: o.y * wake };
  }

  /** The drawing's points right now: settling, then its motion applied. */
  points(): Pt[] {
    const settle = Math.min(1, this.t / SETTLE_MS), e = settle * settle * (3 - 2 * settle);
    const m = this.motion, t = Math.max(0, this.t - this.aliveAt), s = this.size;
    const wake = m ? Math.min(1, t / WAKE_MS) : 0;
    const o = this.offset(t, wake);
    // facing follows the direction of travel
    const ahead = this.offset(t + 120, wake);
    if (Math.abs(ahead.x - o.x) > 0.3) this.facing = ahead.x > o.x ? 1 : -1;
    const flip = m && m !== 'sway' && m !== 'beat' && m !== 'twinkle' && m !== 'spin' && m !== 'float' ? this.facing : 1;
    let rot = 0, scale = 1, sx = 1, sy = 1;
    if (m === 'walk') rot = Math.sin(t / 170) * 0.09 * wake;
    if (m === 'float') rot = Math.sin(t / 1900) * 0.07 * wake;
    if (m === 'sway') rot = Math.sin(t / 900) * 0.13 * wake;
    if (m === 'spin') rot = (t / 6000) * Math.PI * 2 * wake;
    if (m === 'beat') { const b = (t / 1000) % 1; scale = 1 + (Math.exp(-((b - 0.1) ** 2) / 0.002) * 0.12 + Math.exp(-((b - 0.3) ** 2) / 0.002) * 0.08) * wake; }
    if (m === 'twinkle') { scale = 1 + Math.sin(t / 260) * 0.06 * wake; rot = Math.sin(t / 1300) * 0.08 * wake; }
    if (m === 'hop') { const ph = (t / 900) % 1, land = Math.max(0, 1 - Math.abs(ph - 0.98) * 12); sy = 1 - 0.12 * land * wake; sx = 1 + 0.08 * land * wake; }
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivotY = m === 'sway' ? Math.max(...this.base.map((p) => p.y)) : 0; // a flower sways from its stem
    return this.base.map((b, i) => {
      const r = this.raw[i];
      let x = r.x + (b.x - r.x) * e, y = r.y + (b.y - r.y) * e;
      x *= flip;
      if (m === 'fly') x *= 1 - (1 - Math.abs(Math.cos(t / 150))) * 0.65 * wake; // wings flap around the middle
      if (m === 'swim') y += Math.sin((x / s) * Math.PI * 2 - t / 200) * s * 0.06 * wake; // a ripple through the body
      if (m === 'slither') y += Math.sin((x / s) * Math.PI * 3 - t / 260) * s * 0.11 * wake;
      x *= sx * scale; y *= sy * scale;
      const ry = y - pivotY;
      return { x: this.home.x + o.x + x * cos - ry * sin, y: this.home.y + o.y + pivotY + x * sin + ry * cos };
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.done) return;
    const pts = this.points();
    ctx.save();
    applyShadowStyle(ctx, this.fade);
    ctx.lineWidth = Math.max(7, this.size * 0.035);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (this.closed) { ctx.closePath(); ctx.fill(); } // a closed drawing becomes a solid shadow shape
    ctx.stroke();
    if (this.motion === 'walk' && this.t > this.aliveAt) {
      const b = this.box(), t = this.t - this.aliveAt;
      for (const [k, ph] of [[0.35, 0], [0.65, Math.PI]] as const) {
        const x = b.x + b.w * k, y = b.y + b.h, a = Math.sin(t / 170 + ph) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + Math.sin(a) * this.size * 0.16, y + Math.cos(a) * this.size * 0.16);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  darkMask(w: number, h: number): Mask {
    const out: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    if (this.fade < 0.5) return out;
    for (const p of this.points()) {
      const x = Math.round(p.x), y = Math.round(p.y);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) out.data[Y * w + X] = 1;
      }
    }
    return out;
  }
}
