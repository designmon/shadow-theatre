import type { Box, CreatureKind, Mask, Pt } from '../types';
import { planPath } from './path';
import { pointAlong } from './peel';
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
  /** Whether it mirrors when travelling left. */
  flips: boolean;
  /** Extra offset in rig units (hops, bobs) at time t (ms). */
  bob?: (t: number) => Pt;
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
};

const MIN_SPEED = 0.2; // px per ms

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

  constructor(private def: CreatureDef, spawn: Spawn) {
    this.kind = def.kind;
    const a = spawn.anchorBox;
    this.scale = Math.max(a.w, a.h) / Math.max(def.headBox.w, def.headBox.h);
    this.path = planPath(spawn);
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
    this.pos = Math.min(this.pathLen, this.pos + dtMs * this.speed);
    const dx = pointAlong(this.path, this.pos + 5).x - pointAlong(this.path, this.pos).x;
    if (this.def.flips && Math.abs(dx) > 0.5) this.flip = dx < 0;
  }

  /** Rig-units -> world transform parts: world = at + scale * flip(rig - headCenter + bob). */
  private frame() {
    const at = pointAlong(this.path, this.pos);
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
