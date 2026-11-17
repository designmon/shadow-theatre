import type { Box, CreatureKind, Mask, Pt } from '../types';
import { planPath, pointAlong } from './path';
import { applyShadowStyle } from './style';
import type { Creature, Spawn } from './types';

/**
 * A creature design in its own "rig units", drawn facing right, as flat black
 * shapes. `headBox` is the part that matches the hand shadow it grew from.
 */
export type CreatureDef = {
  kind: Exclude<CreatureKind, 'unknown'>;
  headBox: Box;
  /** Everything it can cover (for darkMask), in rig units. */
  extent: Box;
  /** Travel speed in head-sizes per second. */
  speed: number;
  /** Time on the spot before it sets off (bark, crouch...). */
  introMs: number;
  /** Whether it mirrors when travelling left. */
  flips: boolean;
  /** Extra offset in rig units (hops, bobs) at time t (ms). */
  bob?: (t: number) => Pt;
  /** Forward-speed multiplier over time (a rabbit only travels while in the air). Default 1. */
  pace?: (t: number) => number;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
};

const MIN_SPEED = 0.12; // px per ms
const FLEE_MS = 800;
const FLEE_SPEED = 0.35; // px per ms
const SHY_GRACE_MS = 1000; // after the intro, before it starts minding hands
const MAX_SHOVE = 1.5; // head sizes

export class RiggedCreature implements Creature {
  readonly kind: CreatureKind;
  t = 0;
  alpha = 1;
  private path: Pt[];
  private pathLen: number;
  private pos = 0;
  private scale: number;
  private flip = false;
  private speed: number;

  flee: { dir: Pt; until: number } | null = null;
  private lastHandDist: number | null = null;
  private shove: Pt = { x: 0, y: 0 };

  constructor(private def: CreatureDef, spawn: Spawn, seed?: number) {
    this.kind = def.kind;
    const a = spawn.anchorBox;
    this.scale = Math.max(a.w, a.h) / Math.max(def.headBox.w, def.headBox.h);
    this.path = planPath(spawn, seed);
    this.pathLen = this.path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - this.path[i].x, p.y - this.path[i].y), 0);
    this.speed = Math.max(MIN_SPEED, (def.speed * Math.max(a.w, a.h)) / 1000);
    const dx = this.path[1].x - this.path[0].x;
    this.flip = def.flips && (Math.abs(dx) > 1 ? dx < 0 : spawn.facing === 'left');
  }

  get done(): boolean {
    return this.pos >= this.pathLen;
  }

  update(dtMs: number): void {
    this.t += dtMs;
    if (this.t > this.def.introMs) this.pos = Math.min(this.pathLen, this.pos + dtMs * this.speed * (this.def.pace?.(this.t - this.def.introMs) ?? 1));
    if (this.flee) {
      this.shove = { x: this.shove.x + this.flee.dir.x * FLEE_SPEED * dtMs, y: this.shove.y + this.flee.dir.y * FLEE_SPEED * dtMs };
      const max = MAX_SHOVE * this.scale * Math.max(this.def.headBox.w, this.def.headBox.h);
      const m = Math.hypot(this.shove.x, this.shove.y);
      if (m > max) this.shove = { x: (this.shove.x * max) / m, y: (this.shove.y * max) / m };
      if (this.t >= this.flee.until) this.flee = null;
    }
    const dx = pointAlong(this.path, this.pos + 5).x - pointAlong(this.path, this.pos).x;
    if (this.def.flips && Math.abs(dx) > 0.5) this.flip = dx < 0;
  }

  /** A hand shadow came near: dart away from it for a moment (only if within one body-width). */
  avoid(box: Box): void {
    const h = this.headBoxWorld();
    const hc = { x: h.x + h.w / 2, y: h.y + h.h / 2 }, bc = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const reach = Math.max(h.w, h.h) + Math.max(box.w, box.h) / 2;
    const dx = hc.x - bc.x, dy = hc.y - bc.y, d = Math.hypot(dx, dy);
    const prev = this.lastHandDist;
    this.lastHandDist = d;
    if (this.t < this.def.introMs + SHY_GRACE_MS) return; // don't run from the hand that just made you
    if (d > reach * 1.5 || this.flee) return;
    if (prev === null || prev - d < 10) return; // only a hand that is coming closer
    this.flee = { dir: d > 0 ? { x: dx / d, y: dy / d } : { x: 0, y: -1 }, until: this.t + FLEE_MS };
  }

  /** Rig-units -> world transform parts: world = at + scale * flip(rig - headCenter + bob). */
  private frame() {
    const p = pointAlong(this.path, this.pos);
    const at = { x: p.x + this.shove.x, y: p.y + this.shove.y };
    const hb = this.def.headBox;
    const bob = this.t > 0 && this.def.bob ? this.def.bob(this.t) : { x: 0, y: 0 };
    return { at, s: this.scale, fx: this.flip ? -1 : 1, cx: hb.x + hb.w / 2 - bob.x, cy: hb.y + hb.h / 2 - bob.y };
  }

  private toWorld(b: Box): Box {
    const { at, s, fx, cx, cy } = this.frame();
    const xs = [b.x, b.x + b.w].map((x) => at.x + fx * s * (x - cx));
    const ys = [b.y, b.y + b.h].map((y) => at.y + s * (y - cy));
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
  }

  headBoxWorld(): Box {
    return this.toWorld(this.def.headBox);
  }

  extentWorld(): Box {
    return this.toWorld(this.def.extent);
  }

  darkMask(w: number, h: number): Mask {
    const out: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    if (this.done || this.alpha < 0.5) return out;
    // conservative: the head box plus the middle band of the full extent
    for (const b of [this.toWorld(this.def.headBox), this.toWorld(this.def.extent)]) {
      const x0 = Math.max(0, Math.floor(b.x)), x1 = Math.min(w, Math.ceil(b.x + b.w));
      const y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(h, Math.ceil(b.y + b.h));
      for (let y = y0; y < y1; y++) out.data.fill(1, y * w + x0, y * w + Math.max(x0, x1));
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.done) return;
    const { at, s, fx, cx, cy } = this.frame();
    ctx.save();
    applyShadowStyle(ctx, this.alpha);
    ctx.translate(at.x, at.y);
    ctx.scale(fx * s, s);
    ctx.translate(-cx, -cy);
    this.def.draw(ctx, this.t);
    ctx.restore();
  }
}

// ---- drawing helpers (rig units) ----
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
export function poly(ctx: CanvasRenderingContext2D, ...pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}
/** Draw `fn` rotated by `angle` around (px, py). */
export function around(ctx: CanvasRenderingContext2D, px: number, py: number, angle: number, fn: () => void) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.translate(-px, -py);
  fn();
  ctx.restore();
}

/** A closed smooth outline through points (Catmull-Rom), filled. */
export function blob(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
  ctx.fill();
}

/** A tapered segment from a to b (width wa -> wb) with round ends (no self-overlap, so no holes). */
export function taper(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, wa: number, wb: number): void {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(ax + (nx * wa) / 2, ay + (ny * wa) / 2);
  ctx.lineTo(bx + (nx * wb) / 2, by + (ny * wb) / 2);
  ctx.lineTo(bx - (nx * wb) / 2, by - (ny * wb) / 2);
  ctx.lineTo(ax - (nx * wa) / 2, ay - (ny * wa) / 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, wa / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by, wb / 2, 0, Math.PI * 2); ctx.fill();
}

/**
 * A two-segment leg hanging from a hip/shoulder: upper segment at angle a1 (radians from straight down,
 * positive = swung forward), lower segment bent by a2 relative to it. Returns the foot position.
 */
export function leg(ctx: CanvasRenderingContext2D, x: number, y: number, a1: number, l1: number, a2: number, l2: number, w1: number, w2: number): [number, number] {
  const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
  const b = a1 + a2;
  const fx = kx + Math.sin(b) * l2, fy = ky + Math.cos(b) * l2;
  taper(ctx, x, y, kx, ky, w1, (w1 + w2) / 2);
  taper(ctx, kx, ky, fx, fy, (w1 + w2) / 2, w2);
  return [fx, fy];
}
