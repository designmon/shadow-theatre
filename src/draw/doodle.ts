import { planPath, pointAlong } from '../creatures/path';
import { applyShadowStyle } from '../creatures/style';
import type { Creature, Spawn } from '../creatures/types';
import type { Box, Mask, Pt } from '../types';

/** How a drawing comes alive — chosen by recognition, so anything you draw can move. */
export const MOTIONS = ['fly', 'swim', 'slither', 'hop', 'walk', 'sway', 'float'] as const;
export type Motion = (typeof MOTIONS)[number];

const SPEED = 1 / 9000; // fraction of the wall width per ms: a calm pace you can watch
const RETIRE_MS = 1500;

/**
 * A drawing made with the fingertip laser. It starts exactly as drawn; once it knows how it
 * moves it animates its own lines (wings flap, a body ripples, it hops or sways) and explores
 * the wall without leaving it.
 */
export class Doodle implements Creature {
  kind = 'unknown' as const;
  private base: Pt[]; // points relative to the centre
  private pos: Pt;
  private size: number;
  private closed: boolean;
  private motion: Motion | null = null;
  private t = 0;
  private aliveAt = 0;
  private path: Pt[] = [];
  private pathLen = 0;
  private along = 0;
  private origin: Pt;
  private pauseUntil = 0;
  private seed = Math.floor(Math.random() * 1e9);
  private facing = 1;
  private retireAt: number | null = null;
  private fade = 1;

  constructor(stroke: Pt[], private wall: { w: number; h: number }) {
    const c = { x: 0, y: 0 };
    for (const p of stroke) { c.x += p.x; c.y += p.y; }
    c.x /= stroke.length; c.y /= stroke.length;
    this.pos = { ...c };
    this.origin = { ...c };
    this.base = stroke.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const xs = this.base.map((p) => p.x), ys = this.base.map((p) => p.y);
    this.size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 20);
    const a = stroke[0], z = stroke[stroke.length - 1];
    this.closed = Math.hypot(a.x - z.x, a.y - z.y) < this.size * 0.25;
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

  /** Bounding box of the drawing as it is now (projector px). */
  box(): Box {
    const pts = this.points();
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  comeAlive(motion: Motion): void {
    this.motion = motion;
    this.aliveAt = this.t;
    if (motion !== 'sway') this.nextLeg();
  }

  private nextLeg() {
    const spawn: Spawn = {
      anchorBox: { x: this.pos.x - this.size / 2, y: this.pos.y - this.size / 2, w: this.size, h: this.size },
      facing: 'right', openSide: this.pos.x < this.wall.w / 2 ? 'right' : 'left', wall: this.wall, avoid: null,
    };
    this.seed += 1;
    this.path = planPath(spawn, this.seed, { wander: 2, exit: false });
    this.pathLen = this.path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - this.path[i].x, p.y - this.path[i].y), 0);
    this.along = 0;
    this.origin = { ...this.pos };
    this.pauseUntil = this.t + 600;
  }

  update(dtMs: number): void {
    this.t += dtMs;
    if (this.retireAt !== null) this.fade = Math.max(0, 1 - (this.t - this.retireAt) / RETIRE_MS);
    if (!this.motion || this.motion === 'sway' || this.t < this.pauseUntil) return;
    const speed = this.wall.w * SPEED * (this.motion === 'hop' ? 2.6 * this.hopAir() : 1);
    const before = pointAlong(this.path, this.along);
    this.along = Math.min(this.pathLen, this.along + dtMs * speed);
    const p = pointAlong(this.path, this.along);
    const c0 = this.path[0];
    this.pos = { x: this.origin.x + p.x - c0.x, y: this.origin.y + p.y - c0.y };
    if (Math.abs(p.x - before.x) > 0.05) this.facing = p.x > before.x ? 1 : -1;
    if (this.along >= this.pathLen) this.nextLeg();
  }

  private hopAir(): number {
    const ph = ((this.t - this.aliveAt) / 700) % 1;
    return ph > 0.2 && ph < 0.8 ? Math.sin(((ph - 0.2) / 0.6) * Math.PI) : 0;
  }

  /** The drawing's points right now, with its motion applied. */
  points(): Pt[] {
    const s = this.size, t = this.t - this.aliveAt, m = this.motion;
    // ease the motion in so the drawing visibly wakes up
    const wake = m ? Math.min(1, t / 900) : 0;
    let rot = 0, dy = 0, sx = 1, sy = 1;
    if (m === 'walk') { rot = Math.sin(t / 160) * 0.1 * wake; dy = -Math.abs(Math.sin(t / 160)) * s * 0.05 * wake; }
    if (m === 'float') { rot = Math.sin(t / 900) * 0.08 * wake; dy = Math.sin(t / 600) * s * 0.06 * wake; }
    if (m === 'hop') { const a = this.hopAir(); dy = -a * s * 0.45 * wake; sy = 1 + (a - 0.3) * 0.15 * wake; sx = 1 / sy; }
    if (m === 'fly') dy = Math.sin(t / 220) * s * 0.06 * wake;
    if (m === 'sway') rot = Math.sin(t / 700) * 0.14 * wake;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivotY = m === 'sway' ? Math.max(...this.base.map((p) => p.y)) : 0; // a flower sways from its stem
    return this.base.map((b) => {
      let x = b.x * this.facing, y = b.y;
      if (m === 'fly') x *= 0.3 + 0.7 * Math.abs(Math.cos(t / 140)) * wake + (1 - wake) * 0.7; // wings flap around the middle
      if (m === 'swim') y += Math.sin((x / s) * Math.PI * 2 - t / 180) * s * 0.07 * wake; // a ripple through the body
      if (m === 'slither') y += Math.sin((x / s) * Math.PI * 3 - t / 260) * s * 0.12 * wake;
      x *= sx; y *= sy;
      const ry = y - pivotY;
      return { x: this.pos.x + x * cos - ry * sin, y: this.pos.y + pivotY + x * sin + ry * cos + dy };
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.done) return;
    const pts = this.points();
    ctx.save();
    applyShadowStyle(ctx, this.fade);
    ctx.lineWidth = Math.max(6, this.size * 0.04);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (this.closed) { ctx.closePath(); ctx.fill(); } // a closed drawing becomes a solid shadow shape
    ctx.stroke();
    if (this.motion === 'walk') {
      // two little legs ticking underneath
      const b = this.box(), t = this.t - this.aliveAt;
      for (const [k, ph] of [[0.35, 0], [0.65, Math.PI]] as const) {
        const x = b.x + b.w * k, y = b.y + b.h, a = Math.sin(t / 160 + ph) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x + Math.sin(a) * this.size * 0.18, y + Math.cos(a) * this.size * 0.18);
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
