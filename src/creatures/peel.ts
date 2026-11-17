import type { Box, CreatureKind, Mask, Pt, Recognition } from '../types';
import { createCreature } from './index';
import { planPath, pointAlong } from './path';
import { centroidOf, morphOutline, outlineOf, type Outline } from './morph';
import { setBlur } from './style';
import type { RiggedCreature } from './rig';
import { applyShadowStyle } from './style';
import { DIRS, type Creature, type Spawn } from './types';

const SLIDE_MS = 600;
export const WAIT_MS = 6500; // a bit longer than the recognition timeout
const DRIFT_SPEED = 0.15; // px per ms: an unrecognised shape wanders off with its own outline
const GAP = 8;
const HOLD_MS = 350; // the copied hand shape stays a moment, so you see it's yours
const MORPH_MS = 1200; // then its outline melts slowly into the animal's
const HANDOFF = 0.82; // after this much of the morph, the real drawing fades in

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
  private morphFrom: Outline | null = null;
  private morphTo: Outline | null = null;
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

  /** How long it has been fully opaque (0 while fading/morphing) — for the alignment check. */
  get steadyMs(): number {
    if (this.phase === 'slide' || this.phase === 'wait') return this.t;
    if (this.phase === 'creature') return this.t - (this.morphStart + HOLD_MS + MORPH_MS);
    return 0;
  }

  private retireAt: number | null = null;

  retire(): void {
    if (this.creature) this.creature.retire();
    else if (this.retireAt === null) this.retireAt = this.t;
  }

  get retiring(): boolean {
    return this.retireAt !== null || (this.creature?.retiring ?? false);
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
    if (this.retireAt !== null && (this.phase === 'slide' || this.phase === 'wait')) this.startDrift();
    if (this.phase === 'drift') this.stepDrift(dtMs);
    if (this.phase === 'morph' || this.phase === 'creature') {
      const k = this.morphK();
      // the animal starts its routine (bark, crouch, hop) only once it has fully formed
      if (this.phase === 'creature' || k >= 1) this.creature!.update(dtMs);
      if (this.morphTo) {
        // outline morph: the copied shadow itself is replaced by the morphing outline
        const h = Math.max(0, (k - HANDOFF) / (1 - HANDOFF));
        this.alpha = 0;
        this.creature!.alpha = h;
      } else {
        this.alpha = 1 - k;
        this.creature!.alpha = k;
      }
      if (k >= 1) this.phase = 'creature';
    }
  }

  private morphK(): number {
    return Math.min(1, Math.max(0, (this.t - this.morphStart - HOLD_MS) / MORPH_MS));
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
    this.prepareOutlineMorph();
  }

  /** Outlines of the copied shadow (now) and of the animal's first pose, for the melting morph. */
  private prepareOutlineMorph() {
    if (typeof OffscreenCanvas === 'undefined' || !this.creature) return;
    const N = 240;
    const { mask, box } = this.shape;
    const c0 = centroidOf(mask);
    this.morphFrom = { c: { x: box.x + this.offset.x + c0.x, y: box.y + this.offset.y + c0.y }, r: outlineOf(mask, c0, N) };
    const e = this.creature.extentWorld(), pad = 8;
    const w = Math.ceil(e.w + 2 * pad), h = Math.ceil(e.h + 2 * pad);
    const oc = new OffscreenCanvas(w, h), octx = oc.getContext('2d', { willReadFrequently: true })! as unknown as CanvasRenderingContext2D;
    octx.translate(pad - e.x, pad - e.y);
    const a = this.creature.alpha;
    this.creature.alpha = 1;
    setBlur(false);
    this.creature.draw(octx);
    setBlur(true);
    this.creature.alpha = a;
    const px = octx.getImageData(0, 0, w, h).data;
    const m: Mask = { width: w, height: h, data: new Uint8Array(w * h) };
    for (let i = 0; i < m.data.length; i++) m.data[i] = px[i * 4 + 3] > 128 ? 1 : 0;
    const c1 = centroidOf(m);
    this.morphTo = { c: { x: e.x - pad + c1.x, y: e.y - pad + c1.y }, r: outlineOf(m, c1, N) };
  }

  private startDrift() {
    this.kind = 'unknown';
    this.phase = 'drift';
    const b = this.shape.box;
    const at = { ...b, x: b.x + this.offset.x, y: b.y + this.offset.y };
    this.path = planPath({ ...this.spawn, anchorBox: at }, undefined, { wander: 2, exit: false });
    this.pathPos = 0;
    this.pathLen = this.path.slice(1).reduce((s, q, i) => s + Math.hypot(q.x - this.path[i].x, q.y - this.path[i].y), 0);
  }
  private pathLen = 0;

  private stepDrift(dtMs: number) {
    // an unrecognised shape wanders a little, then settles and floats there (it stays part of the picture)
    this.pathPos = Math.min(this.pathLen, this.pathPos + dtMs * DRIFT_SPEED);
    this.alpha = this.retireAt === null ? 1 : Math.max(0, 1 - (this.t - this.retireAt) / 1500);
    const p = pointAlong(this.path, this.pathPos);
    const c0 = this.path[0];
    const base = this.offsetAtDriftStart ?? (this.offsetAtDriftStart = { ...this.offset });
    const bob = Math.sin(this.t / 260) * 6; // a gentle float so it feels alive
    this.offset = { x: base.x + p.x - c0.x, y: base.y + p.y - c0.y + bob };
    if (this.alpha <= 0) this.phase = 'gone';
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
    if (this.phase === 'morph' && this.morphFrom && this.morphTo) {
      const k = this.morphK();
      const e = k * k * (3 - 2 * k);
      const pts = morphOutline(this.morphFrom, this.morphTo, e);
      ctx.save();
      applyShadowStyle(ctx, k < HANDOFF ? 1 : 1 - (k - HANDOFF) / (1 - HANDOFF));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
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
