import type { Box, CreatureKind, Mask, Pt, Recognition } from '../types';
import { createCreature } from './index';
import { planPath, pointAlong } from './path';
import type { RiggedCreature } from './rig';
import { applyShadowStyle } from './style';
import { DIRS, type Creature, type Spawn } from './types';

const SLIDE_MS = 600;
const WAIT_MS = 4000;
const DRIFT_MS = 2000;
const DRIFT_SPEED = 0.2; // px per ms
const GAP = 8;
const MORPH_MS = 500;

type Phase = 'slide' | 'wait' | 'drift' | 'morph' | 'creature' | 'gone';

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

  private creature: RiggedCreature | null = null;
  private morphStart = 0;

  /** `snapBox`: projector box of the image sent for recognition (anchor coords are relative to it). */
  constructor(protected shape: { mask: Mask; box: Box }, protected spawn: Spawn, private snapBox: Box = shape.box) {
    const d = DIRS[spawn.openSide];
    const b = shape.box, { w, h } = spawn.wall;
    // room between the shape's leading edge and the wall edge it is heading to
    const room = d.x > 0 ? w - (b.x + b.w) : d.x < 0 ? b.x : d.y > 0 ? h - (b.y + b.h) : b.y;
    const dist = Math.min((d.x !== 0 ? b.w : b.h) + GAP, Math.max(0, room / 2));
    this.slideTo = { x: d.x * dist, y: d.y * dist };
  }

  get done(): boolean {
    return this.phase === 'gone' || (this.creature?.done ?? false);
  }

  /** Forward a nearby hand to the creature (once there is one). */
  avoid(box: Box): void {
    if (this.phase === 'creature') this.creature?.avoid(box);
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
    if (this.phase === 'wait' && this.resolution && this.resolution.kind !== 'unknown') this.startCreature(this.resolution);
    else if (this.phase === 'wait' && (this.resolution || this.t >= WAIT_MS)) this.startDrift();
    if (this.phase === 'drift') this.stepDrift(dtMs);
    if (this.phase === 'morph' || this.phase === 'creature') {
      this.creature!.update(dtMs);
      const k = Math.min(1, (this.t - this.morphStart) / MORPH_MS);
      this.alpha = 1 - k;
      this.creature!.alpha = k;
      if (k >= 1) this.phase = 'creature';
    }
  }

  /** The creature takes over: its head lands where the recognized head is, on the slid silhouette. */
  private startCreature(rec: Recognition) {
    const kind = rec.kind as Exclude<CreatureKind, 'unknown'>;
    const b = this.shape.box, sb = this.snapBox;
    const ax = sb.x + rec.anchor.x * sb.w + this.offset.x, ay = sb.y + rec.anchor.y * sb.h + this.offset.y;
    // head size = the hand's thickness across the reach direction (the arm only adds length)
    const across = this.spawn.openSide === 'left' || this.spawn.openSide === 'right' ? b.h : b.w;
    const size = Math.max(24, Math.min(across, 0.7 * Math.max(b.w, b.h)));
    const anchorBox = { x: ax - size / 2, y: ay - size / 2, w: size, h: size };
    this.creature = createCreature(kind, { ...this.spawn, anchorBox, facing: rec.facing });
    this.creature.alpha = 0;
    this.kind = kind;
    this.phase = 'morph';
    this.morphStart = this.t;
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
    const out: Mask = this.creature ? this.creature.darkMask(w, h) : { width: w, height: h, data: new Uint8Array(w * h) };
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
    this.creature?.draw(ctx);
    if (this.alpha <= 0) return;
    if (!this.sprite) this.sprite = maskSprite(this.shape.mask);
    ctx.save();
    applyShadowStyle(ctx, this.alpha);
    ctx.drawImage(this.sprite, this.shape.box.x + this.offset.x, this.shape.box.y + this.offset.y);
    ctx.restore();
  }
}

function maskSprite(mask: Mask): OffscreenCanvas {
  const c = new OffscreenCanvas(mask.width, mask.height);
  const img = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) img.data[i * 4 + 3] = mask.data[i] ? 255 : 0;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
