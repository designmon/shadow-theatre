import type { Box, CreatureKind, Mask, Pt, Recognition } from '../types';
import { planPath } from './path';
import { applyShadowStyle } from './style';
import { DIRS, type Creature, type Spawn } from './types';

const SLIDE_MS = 600;
const WAIT_MS = 4000;
const DRIFT_MS = 2000;
const DRIFT_SPEED = 0.2; // px per ms
const GAP = 8;

type Phase = 'slide' | 'wait' | 'drift' | 'gone';

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** A copy of the real shadow that peels off toward the open side, then becomes a creature or drifts away. */
export class PeelOff implements Creature {
  kind: CreatureKind = 'unknown';
  protected t = 0;
  protected phase: Phase = 'slide';
  protected offset: Pt = { x: 0, y: 0 };
  protected alpha = 1;
  protected resolution: Recognition | null = null;
  private path: Pt[] = [];
  private pathPos = 0;
  private sprite: OffscreenCanvas | null = null;
  protected readonly slideTo: Pt;

  constructor(protected shape: { mask: Mask; box: Box }, protected spawn: Spawn) {
    const d = DIRS[spawn.openSide];
    const dist = (d.x !== 0 ? shape.box.w : shape.box.h) + GAP;
    this.slideTo = { x: d.x * dist, y: d.y * dist };
  }

  get done(): boolean {
    return this.phase === 'gone';
  }

  resolve(rec: Recognition): void {
    this.resolution = rec;
  }

  update(dtMs: number): void {
    this.t += dtMs;
    if (this.phase === 'slide') {
      const k = ease(Math.min(1, this.t / SLIDE_MS));
      this.offset = { x: this.slideTo.x * k, y: this.slideTo.y * k };
      if (this.t >= SLIDE_MS) this.phase = 'wait';
    }
    if (this.phase === 'wait' && (this.resolution || this.t >= WAIT_MS)) this.startDrift();
    if (this.phase === 'drift') this.stepDrift(dtMs);
  }

  private startDrift() {
    this.kind = 'unknown';
    this.phase = 'drift';
    const b = this.shape.box;
    const at = { ...b, x: b.x + this.offset.x, y: b.y + this.offset.y };
    this.path = planPath({ ...this.spawn, anchorBox: at });
    this.pathPos = 0;
    this.driftStart = this.t;
  }
  private driftStart = 0;

  private stepDrift(dtMs: number) {
    const k = (this.t - this.driftStart) / DRIFT_MS;
    this.alpha = Math.max(0, 1 - k);
    this.pathPos += dtMs * DRIFT_SPEED;
    const p = pointAlong(this.path, this.pathPos);
    const c0 = this.path[0];
    const base = this.offsetAtDriftStart ?? (this.offsetAtDriftStart = { ...this.offset });
    this.offset = { x: base.x + p.x - c0.x, y: base.y + p.y - c0.y };
    if (k >= 1) this.phase = 'gone';
  }
  private offsetAtDriftStart: Pt | null = null;

  darkMask(w: number, h: number): Mask {
    const out: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    if (this.phase === 'gone' || this.alpha < 0.5) return out;
    const { mask, box } = this.shape;
    const ox = Math.round(box.x + this.offset.x), oy = Math.round(box.y + this.offset.y);
    for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      const X = x + ox, Y = y + oy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) out.data[Y * w + X] = 1;
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'gone') return;
    if (!this.sprite) this.sprite = maskSprite(this.shape.mask);
    ctx.save();
    applyShadowStyle(ctx, this.alpha);
    ctx.drawImage(this.sprite, this.shape.box.x + this.offset.x, this.shape.box.y + this.offset.y);
    ctx.restore();
  }
}

export function pointAlong(path: Pt[], dist: number): Pt {
  let left = dist;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) return { x: a.x + ((b.x - a.x) * left) / seg, y: a.y + ((b.y - a.y) * left) / seg };
    left -= seg;
  }
  return path[path.length - 1];
}

function maskSprite(mask: Mask): OffscreenCanvas {
  const c = new OffscreenCanvas(mask.width, mask.height);
  const img = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) img.data[i * 4 + 3] = mask.data[i] ? 255 : 0;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
