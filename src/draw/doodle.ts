import { applyShadowStyle } from '../creatures/style';

import { accentAt, INK_COLOR as INK } from './render';
const INK_W = 7; // matches the pen's settled ink (render.ts)
import type { Creature } from '../creatures/types';
import type { Box, Mask, Pt } from '../types';
import { refineStroke } from './refine';
import { fitIcon, type IconStroke } from './icons';
import { chipAt, drawBubble, type Bubble, type BubbleLayout } from '../story/bubble';

/** A little action: a hop, a spin, a shake, growing for a moment, or rain (a cloud). */
export type Trick = 'jump' | 'spin' | 'shake' | 'grow' | 'rain';
const TRICK_MS: Record<Trick, number> = { jump: 750, spin: 900, shake: 700, grow: 900, rain: 2600 };

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
const CLIP_FADE_MS = 700; // a Runway clip crossfades back to the still drawing
const CLIP_IN_MS = 700; // ... and in from it (pointed at)
const CLIP_REVEAL_MS = 2200; // a clip that just arrived from Runway: a slow reveal
const AFTER_CLIP_MS = 1500; // the still drawing holds a moment, then goes back to its place
const REDRAW_MS = 1300; // the clean drawing of what it is draws itself over your lines
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
/** A Runway clip of this drawing (src/runway/clips.ts), drawn in its place. */
export interface DoodleClip {
  start(): void;
  readonly ended: boolean;
  /** ms left (Infinity while unknown). */
  readonly remainingMs: number;
  draw(ctx: CanvasRenderingContext2D, rect: Box, alpha: number): void;
}
/** How the drawing sits in its Runway image: image px = 640 + (local - c) * s (1280 x 720). */
export type RunwayFit = { s: number; cx: number; cy: number; w: number; h: number };
export type Shape = { pts: Pt[]; closed: boolean; fill: boolean };

export class Doodle implements Creature {
  kind = 'unknown' as const;
  /** For Runway files: <yyyymmdd-hhmmss>-<label>, set once it is recognised. */
  id = '';
  /** How it sits in its Runway export (set when exported). */
  runwayFit: RunwayFit | null = null;
  /** 0..1: hidden while a scene clip plays over the whole wall. */
  veil = 1;
  private clip: DoodleClip | null = null;
  private clipStarted = false;
  private clipIn = CLIP_IN_MS;
  private clipQueued = false;
  /** A Runway clip is being generated for it (phase 2): a faint shimmer runs along the line. */
  pending = false;
  private strokes: Stroke[];
  private home: Pt;
  private size: number;
  private motion: Motion | null = null;
  private label = '';
  private t = 0;
  private aliveAt = Infinity;
  private beautifyAt = Infinity;
  private phase: 'drawn' | 'performing' | 'toPark' | 'parked' | 'toStage' | 'clip' | 'afterClip' | 'toVisit' | 'visiting' | 'directed' = 'drawn';
  private goal: { from: Pt; to: Pt; at: number; ms: number } | null = null;
  private rideOn: { on: Doodle; dx: number; dy: number } | null = null;
  private backAt: number | null = null; // left the wall: come back by itself then
  /** Clicked: chosen for what you say next ("this", "it"). */
  selected = false;
  /** What it's saying (a speech bubble), in its own time. */
  bubble: Bubble | null = null;
  private trickKind: Trick | null = null;
  private trickAt = -Infinity;
  private visitTo: Pt | null = null;
  private visitMs = 0;
  private readonly bornAt = new Date();
  private phaseAt = 0;
  private slot: Pt | null = null;
  private slotScale = 0.4;
  private facing = 1;
  private retireAt: number | null = null;
  private fade = 1;
  private clean: IconStroke[] | null = null; // the clean drawing of what it is (local coords)
  private redrawAt = Infinity;

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
  comeAlive(motion: Motion, label = '', alreadyClean = false): void {
    this.motion = motion;
    this.label = label;
    const d = this.bornAt, p2 = (v: number) => String(v).padStart(2, '0');
    this.id = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${(label || 'doodle').replace(/[^a-z0-9]/g, '') || 'doodle'}`;
    this.aliveAt = Math.max(this.t, SETTLE_MS);
    this.beautifyAt = this.aliveAt;
    // a clean drawing of what it is, fitted over your lines; otherwise gently refine simple shapes
    const pts = this.strokes.flatMap((st) => st.base), xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    this.clean = fitIcon(label, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    if (this.clean) this.redrawAt = alreadyClean ? -1e9 : this.aliveAt; // drawn by the AI finger: already the clean drawing
    else if (this.strokes.length === 1 && this.strokes[0].closed) this.strokes[0].ideal = fitIdeal(label, this.strokes[0].base);
    this.phase = 'performing';
    this.phaseAt = this.aliveAt;
  }

  /** Where it rests after performing (its place in the row), and how small. */
  park(slot: Pt, scale: number): void {
    const moved = !this.slot || Math.hypot(slot.x - this.slot.x, slot.y - this.slot.y) > 1 || Math.abs(scale - this.slotScale) > 0.01;
    if (moved && (this.phase === 'parked' || this.phase === 'toPark')) {
      // its place in the composition changed: glide there from where it is now
      const now = this.placement();
      this.moveFrom = { c: now.c, scale: now.scale };
      this.phase = 'toPark';
      this.phaseAt = this.t;
    }
    this.slot = { ...slot };
    this.slotScale = scale;
  }

  /** Paused (the stop button): no movement of its own; it still goes to its place. */
  frozen = false;
  private moveFrom: { c: Pt; scale: number } | null = null;

  /** Say something (a speech bubble), optionally a question with answers you can click. */
  say(text: string, ms = 2800, options?: string[], onAnswer?: (o: string) => void): void {
    this.bubble = { text, at: this.t, ms, options, onAnswer };
  }
  /** Do a little trick. */
  trick(kind: Trick): void {
    this.trickKind = kind;
    this.trickAt = this.t;
  }
  /** Story: go over to `target` (wall px), stay a moment, come back to its place. */
  visit(target: Pt, stayMs = 2600): boolean {
    if (this.phase !== 'parked') return false;
    const now = this.placement();
    this.moveFrom = { c: now.c, scale: now.scale };
    this.visitTo = { ...target };
    this.visitMs = stayMs;
    this.phase = 'toVisit';
    this.phaseAt = this.t;
    return true;
  }
  private bubbleLayout: BubbleLayout | null = null;
  /** Its bubble, on top of everything (main draws these last). */
  drawSpeech(ctx: CanvasRenderingContext2D, wall: { w: number; h: number }, hover: Pt | null, avoid: Box[] = []): Box | null {
    if (!this.bubble || this.done || this.veil <= 0) { this.bubbleLayout = null; return null; }
    this.bubbleLayout = drawBubble(ctx, this.bubble, this.anchor(), wall, INK, this.t, hover, avoid);
    return this.bubbleLayout.box;
  }
  /** A click on one of its bubble's answers: answer it. */
  answerAt(p: Pt): boolean {
    if (!this.bubble?.options || !this.bubbleLayout) return false;
    const o = chipAt(this.bubbleLayout, p);
    if (!o) return false;
    const b = this.bubble;
    this.bubble = null;
    b.onAnswer?.(o);
    return true;
  }
  get asking(): boolean { return !!this.bubble?.options; }
  /** Is `p` over its question bubble (so pointing at an answer doesn't start the pen)? */
  overBubble(p: Pt): boolean {
    const L = this.bubbleLayout;
    return !!L && !!this.bubble?.options && p.x > L.box.x - 40 && p.x < L.box.x + L.box.w + 40 && p.y > L.box.y - 40 && p.y < L.box.y + L.box.h + 40;
  }

  /** Told to: go to `p` (wall px) and stay there. */
  goTo(p: Pt, ms = 1600): void {
    const now = this.placement();
    this.rideOn = null;
    this.goal = { from: now.c, to: { ...p }, at: this.t, ms };
    this.phase = 'directed';
    this.phaseAt = this.t;
    this.backAt = null;
  }
  /** Told to: get on `other` (a plane, a boat, a car) — it moves with it from now on. */
  ride(other: Doodle): void {
    const me = this.placement().c, it = other.where;
    this.rideOn = { on: other, dx: me.x - it.x, dy: me.y - it.y };
    this.goal = null;
    this.phase = 'directed';
    this.phaseAt = this.t;
  }
  unride(): void {
    if (!this.rideOn) return;
    const here = this.placement().c;
    this.rideOn = null;
    this.goal = { from: here, to: here, at: this.t, ms: 1 };
  }
  get riding(): Doodle | null { return this.rideOn?.on ?? null; }
  /** Told to: leave the wall that way; it comes back to its place by itself a little later. */
  leave(to: Pt, ms = 2200, backInMs = 9000): void {
    this.goTo(to, ms);
    this.backAt = this.t + ms + backInMs;
  }
  /** Told to: back to its own place. */
  goHome(): void {
    if (this.phase !== 'directed' && this.phase !== 'visiting') return;
    const now = this.placement();
    this.rideOn = null;
    this.goal = null;
    this.moveFrom = { c: now.c, scale: now.scale };
    this.phase = this.slot ? 'toPark' : 'performing';
    this.phaseAt = this.t;
  }
  get directed(): boolean { return this.phase === 'directed'; }
  get returning(): boolean { return this.phase === 'toPark'; }

  /** Resting in the composition (free for a story). */
  get resting(): boolean { return this.phase === 'parked'; }
  /** Where it is now (centre, wall px). */
  get where(): Pt { return this.placement().c; }
  /** Top centre of where it is now: where its bubble points. */
  anchor(): Pt { const b = this.box(); return { x: b.x + b.w / 2, y: b.y }; }

  get what(): string { return this.label; }
  get how(): Motion | null { return this.motion; }
  get playingClip(): boolean { return this.phase === 'clip'; }

  /** Its Runway clip: plays the next time it wakes, instead of the built-in animation. */
  attachClip(clip: DoodleClip): void {
    this.clip = clip;
    this.clipIn = CLIP_IN_MS;
  }

  /** A clip that just arrived from Runway: play it now, wherever it is, with a slow reveal. */
  revealClip(clip: DoodleClip): void {
    this.clip = clip;
    this.pending = false;
    this.clipIn = CLIP_REVEAL_MS;
    if (!this.runwayFit) return;
    if (this.phase === 'parked') this.wake();
    else if (this.phase === 'performing' || this.phase === 'drawn' || this.phase === 'afterClip') { this.phase = 'clip'; this.phaseAt = this.t; this.clipStarted = false; }
    else if (this.phase === 'toPark') this.clipQueued = true; // once it's in its place, it comes back up for it
  }
  get hasClip(): boolean { return !!this.clip; }

  /** The shape it rests as (local coords): the clean drawing if there is one, else your refined line. */
  restShape(): Shape[] {
    if (this.clean) return this.clean.map((st) => ({ pts: st.pts, closed: !!st.closed, fill: !!st.fill }));
    const single = false; // your own lines stay lines (only clean drawings, like the heart, are filled)
    return this.strokes.map((st) => ({ pts: st.base.map((b, i) => (st.ideal ? { x: b.x + (st.ideal[i].x - b.x) * 0.6, y: b.y + (st.ideal[i].y - b.y) * 0.6 } : b)), closed: st.closed, fill: single }));
  }

  /** What's on the wall right now (stage px), with its line weight. */
  shapeNow(): { shapes: Shape[]; lineWidth: number } {
    const f = this.frame(), k = this.redrawK(), { scale } = this.placement();
    const lineWidth = Math.max(3.5, INK_W * Math.sqrt(scale));
    if (this.clean && k >= 1) return { shapes: f.clean.map((pts, i) => ({ pts, closed: !!this.clean![i].closed, fill: !!this.clean![i].fill })), lineWidth };
    const single = false;
    return { shapes: f.user.map((pts, i) => ({ pts, closed: this.strokes[i].closed, fill: single })), lineWidth };
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
    if (this.bubble && this.t - this.bubble.at > this.bubble.ms) this.bubble = null;
    if (this.trickKind && this.t - this.trickAt > TRICK_MS[this.trickKind]) this.trickKind = null;
    if (this.phase === 'directed' && this.backAt !== null && this.t > this.backAt) { this.backAt = null; this.goHome(); }
    if (this.rideOn && this.rideOn.on.returning) this.goHome(); // the vehicle goes home: the passenger gets off and goes home too
    if (this.phase === 'toVisit' && this.t - this.phaseAt > MOVE_MS) { this.phase = 'visiting'; this.phaseAt = this.t; }
    else if (this.phase === 'visiting' && this.t - this.phaseAt > this.visitMs) {
      this.moveFrom = { c: { ...this.visitTo! }, scale: this.slotScale };
      this.phase = 'toPark';
      this.phaseAt = this.t;
    }
    this.t += dtMs;
    if (this.retireAt !== null) this.fade = Math.max(0, 1 - (this.t - this.retireAt) / RETIRE_MS);
    const since = this.t - this.phaseAt;
    if (this.phase === 'performing' && this.slot && since > (this.frozen ? 600 : PERFORM_MS)) { this.phase = 'toPark'; this.phaseAt = this.t; this.moveFrom = null; }
    else if (this.phase === 'toPark' && since > MOVE_MS) { this.phase = 'parked'; this.phaseAt = this.t; this.moveFrom = null; if (this.clipQueued) { this.clipQueued = false; this.wake(); } }
    else if (this.phase === 'toStage' && since > MOVE_MS) {
      // back on stage: its Runway clip if it has one, else the built-in animation
      this.phase = this.clip && this.runwayFit ? 'clip' : 'performing';
      this.phaseAt = this.t;
      this.clipStarted = false;
    } else if (this.phase === 'clip') {
      if (!this.clipStarted) { this.clip!.start(); this.clipStarted = true; }
      if (this.clip!.ended || since > 30000) { this.phase = 'afterClip'; this.phaseAt = this.t; }
    } else if (this.phase === 'afterClip' && since > AFTER_CLIP_MS) { this.phase = this.slot ? 'toPark' : 'performing'; this.phaseAt = this.t; }
  }

  /** Centre and scale right now: on stage, resting in its slot, or on the way between. */
  private placement(): { c: Pt; scale: number; energy: number } {
    const since = this.t - this.phaseAt, k = Math.min(1, since / MOVE_MS), e = k * k * (3 - 2 * k);
    const slot = this.slot ?? this.home, s = this.slotScale;
    if (this.phase === 'toPark') {
      const f = this.moveFrom ?? { c: this.home, scale: 1 };
      return { c: { x: f.c.x + (slot.x - f.c.x) * e, y: f.c.y + (slot.y - f.c.y) * e }, scale: f.scale + (s - f.scale) * e, energy: 1 };
    }
    if (this.phase === 'parked') return { c: slot, scale: s, energy: 0.3 };
    if (this.phase === 'toVisit') { const f = this.moveFrom ?? { c: slot, scale: s }, v = this.visitTo!; return { c: { x: f.c.x + (v.x - f.c.x) * e, y: f.c.y + (v.y - f.c.y) * e }, scale: f.scale + (s - f.scale) * e, energy: 0.7 }; }
    if (this.phase === 'visiting') return { c: this.visitTo!, scale: s, energy: 0.7 };
    if (this.phase === 'directed') {
      const sc = this.slot ? s : 1;
      if (this.rideOn) { const o = this.rideOn.on.where; return { c: { x: o.x + this.rideOn.dx, y: o.y + this.rideOn.dy }, scale: sc, energy: 0.5 }; }
      if (this.goal) { const k = Math.min(1, (this.t - this.goal.at) / this.goal.ms), q = k * k * (3 - 2 * k); return { c: { x: this.goal.from.x + (this.goal.to.x - this.goal.from.x) * q, y: this.goal.from.y + (this.goal.to.y - this.goal.from.y) * q }, scale: sc, energy: 0.7 }; }
    }
    if (this.phase === 'toStage') return { c: { x: slot.x + (this.home.x - slot.x) * e, y: slot.y + (this.home.y - slot.y) * e }, scale: s + (1 - s) * e, energy: 1 };
    return { c: this.home, scale: 1, energy: 1 };
  }

  /** Where its Runway clip goes on the wall: the drawing in the video lands on the drawing here. */
  private clipRect(): Box {
    const f = this.runwayFit!, c = this.home;
    return { x: c.x + f.cx - f.w / 2 / f.s, y: c.y + f.cy - f.h / 2 / f.s, w: f.w / f.s, h: f.h / f.s };
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

  /** How far the clean drawing has drawn itself (0..1). */
  private redrawK(): number {
    const k = Math.min(1, Math.max(0, (this.t - this.redrawAt) / REDRAW_MS));
    return k * k * (3 - 2 * k);
  }

  /** The drawing's visible strokes right now. */
  points(): Pt[][] {
    const f = this.frame(), k = this.redrawK();
    if (!f.clean.length) return f.user;
    return k >= 1 ? f.clean : [...f.user, ...f.clean];
  }

  /** Your strokes and the clean drawing's strokes, placed and animated. */
  private frame(): { user: Pt[][]; clean: Pt[][] } {
    const settle = Math.min(1, this.t / SETTLE_MS), se = settle * settle * (3 - 2 * settle);
    const bk = Math.min(1, Math.max(0, (this.t - this.beautifyAt) / BEAUTIFY_MS)), be = bk * bk * (3 - 2 * bk) * 0.6;
    // at rest it is still: drawings move when they are made, when you tell them to, or in a little scene
    const still = this.phase === 'clip' || this.phase === 'afterClip' || this.phase === 'parked' || this.frozen;
    const m = still ? null : this.motion, t = Math.max(0, this.t - this.aliveAt), s = this.size;
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
    // a trick
    if (this.trickKind && !this.frozen) {
      const k = Math.min(1, (this.t - this.trickAt) / TRICK_MS[this.trickKind]);
      if (this.trickKind === 'jump') bob -= Math.sin(Math.PI * k) * s * 0.45 * scale;
      if (this.trickKind === 'spin') rot += Math.PI * 2 * (k * k * (3 - 2 * k));
      if (this.trickKind === 'shake') rot += Math.sin((this.t - this.trickAt) / 35) * 0.16 * (1 - k);
      if (this.trickKind === 'grow') scale *= 1 + 0.3 * Math.sin(Math.PI * k);
    }
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pivotY = m === 'sway' ? Math.max(...(this.clean ? this.clean.flatMap((st) => st.pts.map((p) => p.y)) : this.strokes.flatMap((st) => st.base.map((p) => p.y)))) : 0;
    const put = (x0: number, y0: number): Pt => {
      let x = x0 * flip, y = y0;
      if (m === 'fly') x *= 1 - (1 - Math.abs(Math.cos(t / 150))) * 0.6 * wake;
      if (m === 'swim') y += Math.sin((x / s) * Math.PI * 2 - t / 200) * s * 0.06 * wake;
      if (m === 'slither') y += Math.sin((x / s) * Math.PI * 3 - t / 260) * s * 0.11 * wake;
      x *= sx * scale; y *= sy * scale;
      const ry = y - pivotY * scale;
      return { x: c.x + o.x + x * cos - ry * sin, y: c.y + o.y + pivotY * scale + x * sin + ry * cos + bob };
    };
    const user = this.strokes.map((st) => st.base.map((b0, i) => {
      const r = st.raw[i];
      const ideal = st.ideal?.[i];
      const bx = ideal ? b0.x + (ideal.x - b0.x) * be : b0.x, by = ideal ? b0.y + (ideal.y - b0.y) * be : b0.y;
      return put(r.x + (bx - r.x) * se, r.y + (by - r.y) * se);
    }));
    const clean = this.clean ? this.clean.map((st) => st.pts.map((p) => put(p.x, p.y))) : [];
    return { user, clean };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.done || this.veil <= 0) return;
    const { user, clean } = this.frame();
    const k = this.clean ? this.redrawK() : 0;
    const { scale } = this.placement();
    // a Runway clip plays in its place; the still drawing fades back in as it ends
    let ink = this.fade * this.veil;
    if (this.phase === 'clip' && this.clip) {
      const left = this.clip.remainingMs, back = Number.isFinite(left) ? Math.max(0, Math.min(1, 1 - left / CLIP_FADE_MS)) : 0;
      const into = Math.min(1, (this.t - this.phaseAt) / this.clipIn), inE = into * into * (3 - 2 * into);
      const show = Math.min(inE, 1 - back);
      this.clip.draw(ctx, this.clipRect(), ink * show);
      ink *= 1 - show;
      if (ink <= 0) return;
    }
    const fade = ink;
    ctx.save();
    applyShadowStyle(ctx, fade);
    ctx.filter = 'none'; // crisp ink, exactly like the line you drew — not a blurry shadow
    ctx.fillStyle = ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(3.5, INK_W * Math.sqrt(scale)); // same weight as the pen's ink; a little lighter at rest
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // your lines, fading as the clean drawing draws itself over them
    if (k < 1) {
      ctx.globalAlpha = fade * (1 - k);
      const fillOne = false; // your own lines stay lines
      for (const pts of user) {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        if (fillOne) { ctx.closePath(); ctx.fill(); }
        ctx.stroke();
      }
    }
    if (clean.length && k > 0) {
      // drawn on along its length, like a pen
      ctx.globalAlpha = fade;
      const lens = clean.map((pts, si) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); if (this.clean![si].closed) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y); return L; });
      let budget = k * lens.reduce((a, b) => a + b, 0);
      clean.forEach((pts, si) => {
        if (budget <= 0) return;
        const st = this.clean![si], full = budget >= lens[si];
        const path = st.closed ? [...pts, pts[0]] : pts;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        let left = budget;
        for (let i = 1; i < path.length && left > 0; i++) {
          const a = path[i - 1], b = path[i], d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d <= left) { ctx.lineTo(b.x, b.y); left -= d; } else { const f = left / d; ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f); left = 0; }
        }
        if (full && st.fill) { ctx.closePath(); ctx.fill(); }
        ctx.stroke();
        budget -= lens[si];
      });
    }
    ctx.globalAlpha = fade;
    if (this.pending && this.phase !== 'clip') this.shimmer(ctx, ctx.lineWidth);
    if (this.motion === 'walk' && !this.clean && this.phase !== 'parked' && this.t > this.aliveAt) {
      const b = this.box(), t = this.t - this.aliveAt;
      for (const [k, ph] of [[0.35, 0], [0.65, Math.PI]] as const) {
        const x = b.x + b.w * k, y = b.y + b.h, a = Math.sin(t / 160 + ph) * 0.5;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x + Math.sin(a) * this.size * 0.14 * scale, y + Math.cos(a) * this.size * 0.14 * scale); ctx.stroke();
      }
    }
    ctx.restore();
    // rain, under a cloud
    if (this.trickKind === 'rain') {
      const b = this.box(), k = (this.t - this.trickAt) / TRICK_MS.rain;
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.globalAlpha = fade * Math.min(1, (1 - k) * 4);
      for (let i = 0; i < 9; i++) {
        const x = b.x + (b.w * (i + 0.5)) / 9, fall = (((this.t - this.trickAt) / 600 + i * 0.37) % 1) * b.h * 1.6;
        ctx.beginPath(); ctx.moveTo(x, b.y + b.h + fall); ctx.lineTo(x - 2, b.y + b.h + fall + 10); ctx.stroke();
      }
      ctx.restore();
    }
    // its name, briefly, in small light type
    const lt = this.t - this.aliveAt;
    if (this.label && this.label !== 'something' && lt > 0 && lt < LABEL_MS) {
      const b = this.box(), a = Math.min(1, lt / 300) * Math.min(1, (LABEL_MS - lt) / 500);
      ctx.save();
      ctx.filter = 'none';
      ctx.globalAlpha = a * fade;
      ctx.fillStyle = INK;
      ctx.font = `300 ${Math.round(20 * devicePixelRatioSafe())}px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.letterSpacing = '0.12em';
      ctx.fillText(this.label.toUpperCase(), b.x + b.w / 2, b.y + b.h + 40 * devicePixelRatioSafe());
      ctx.restore();
    }
  }

  /** Waiting for Runway: a soft highlight travels along the line (no spinner). */
  private shimmer(ctx: CanvasRenderingContext2D, lw: number): void {
    const shapes = this.shapeNow().shapes.filter((sh) => sh.pts.length > 1);
    const segs: [Pt, Pt][] = [];
    for (const sh of shapes) { const p = sh.closed ? [...sh.pts, sh.pts[0]] : sh.pts; for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]); }
    const lens = segs.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y)), total = lens.reduce((a, b) => a + b, 0);
    if (!total) return;
    const head = ((this.t / 2600) % 1) * total, span = Math.min(total * 0.18, 160);
    ctx.save();
    ctx.lineCap = 'round';
    let at = 0;
    segs.forEach(([a, b], i) => {
      const mid = at + lens[i] / 2, d = (head - mid + total) % total; // distance behind the head
      at += lens[i];
      if (d > span) return;
      const k = 1 - d / span;
      ctx.globalAlpha = this.fade * this.veil * 0.55 * k;
      ctx.strokeStyle = `rgb(${accentAt(1 - k)})`;
      ctx.lineWidth = lw + 3 * k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    ctx.restore();
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
