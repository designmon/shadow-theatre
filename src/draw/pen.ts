import type { Pt } from '../types';
import { OneEuro2D } from './oneEuro';

export type PenInput = { tip: Pt; pose: 'point' | 'fist' | 'open'; dir?: Pt };
export type PenState = { mode: 'idle' | 'arming' | 'down'; arm: number /* 0..1 while arming */; finish: number /* 0..1 while the fingertip rests (full = finished) */; cursor: Pt | null; brush?: Pt | null /* where the ink is (trails the fingertip) */; strokes: Pt[][] };
export type Burst = { kind: 'start' | 'finish'; at: Pt };

const ARM_MS = 350; // point (and hold roughly still) this long to turn the pen on
const ARM_STILL = 22; // px: reaching in while pointing doesn't draw a line from the edge
const STILL_PX = 14; // the fingertip resting within this...
const STILL_MS = 1400; // ...this long finishes the drawing (a ring fills)
const HIDDEN_MS = 4000; // the finger hidden in the hand's own shadow: wait this long for it
const LOST_MS = 900; // no shadow at all this long (hand pulled away) = finished
const MIN_STEP = 3; // px between stored points
const STRING = 10; // px: the lazy brush — ink trails the fingertip on a short string, so a tremor never reaches the line
const MIN_POINTS = 8;
const MAX_JUMP = 90; // px in one frame: a fingertip can't teleport; such a frame is a glitch
const RETREAT_SPEED = 1.0; // px/ms: the hand being pulled out of the light, not drawing
const RETREAT_MS = 600;

/**
 * Fingertip pen: one continuous line, drawn by the fingertip alone.
 * Point (and rest a moment) to start. Draw. Rest the fingertip still to finish (a ring fills), or
 * pull the hand out of the light. While drawing, only the fingertip counts: if the finger passes
 * over the hand's own shadow and can't be told apart (the hand isn't a pointing hand that
 * moment), the pen simply waits for it, instead of jumping to some other part of the hand.
 */
export class LaserPen {
  private mode: PenState['mode'] = 'idle';
  private since = 0;
  private lastSeen = 0;
  private hiddenSince: number | null = null;
  private cursor: Pt | null = null;
  private strokes: Pt[][] = [];
  private times: number[][] = [];
  private finished: Pt[][] | null = null;
  private bursts: Burst[] = [];
  private filt = new OneEuro2D(1.1, 0.03);
  private dir: Pt | null = null;
  private lastTip: Pt | null = null;
  private anchor: Pt | null = null; // where arming started / where it has been resting
  private lastTipT = -Infinity;
  private brush: Pt | null = null;
  private stillSince = 0;
  private doneAt: Pt | null = null; // just finished here: don't start again until the finger stops pointing or moves away

  update(input: PenInput | null, tMs: number): PenState {
    let tip = input?.tip ?? null;
    if (tip && this.lastTip && tMs - this.lastTipT < 200 && Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y) > MAX_JUMP) tip = null; // glitch
    else if (tip) { this.lastTip = { ...tip }; this.lastTipT = tMs; }
    if (input?.dir) this.dir = input.dir;
    if (tip) this.lastSeen = tMs;
    const pointing = !!tip && input!.pose === 'point';

    switch (this.mode) {
      case 'idle':
        if (this.doneAt && (!pointing || Math.hypot(tip!.x - this.doneAt.x, tip!.y - this.doneAt.y) > 80)) this.doneAt = null;
        if (pointing && !this.doneAt) { this.mode = 'arming'; this.since = tMs; this.anchor = { ...tip! }; this.filt = new OneEuro2D(1.1, 0.03); this.cursor = this.filt.filter(tip!, tMs); }
        break;
      case 'arming':
        if (!pointing) { if (!tip ? tMs - this.lastSeen > 250 : true) this.reset(); break; }
        this.cursor = this.filt.filter(tip!, tMs);
        if (Math.hypot(tip!.x - this.anchor!.x, tip!.y - this.anchor!.y) > ARM_STILL) { this.anchor = { ...tip! }; this.since = tMs; break; } // still moving in
        if (tMs - this.since >= ARM_MS) {
          this.mode = 'down';
          this.strokes = [[{ ...this.cursor! }]];
          this.brush = { ...this.cursor! };
          this.times = [[tMs]];
          this.anchor = { ...this.cursor! };
          this.stillSince = tMs + 600; // a moment before resting can finish it
          this.bursts.push({ kind: 'start', at: { ...this.cursor! } });
        }
        break;
      case 'down': {
        if (!tip) {
          if (tMs - this.lastSeen > LOST_MS) { this.trimRetreat(); this.finish(); }
          break;
        }
        if (!pointing) {
          // the fingertip can't be seen (over the hand's own shadow): wait for it
          if (this.hiddenSince === null) this.hiddenSince = tMs;
          if (tMs - this.hiddenSince > HIDDEN_MS) this.finish();
          this.stillSince = Math.max(this.stillSince, tMs);
          break;
        }
        this.hiddenSince = null;
        const c = (this.cursor = this.filt.filter(tip!, tMs));
        // lazy brush: the ink only moves when the fingertip pulls the string taut
        const dx = c.x - this.brush!.x, dy = c.y - this.brush!.y, d = Math.hypot(dx, dy);
        if (d > STRING) { const k = (d - STRING) / d; this.brush = { x: this.brush!.x + dx * k, y: this.brush!.y + dy * k }; }
        const s = this.strokes[0], last = s[s.length - 1], b = this.brush!;
        if (Math.hypot(b.x - last.x, b.y - last.y) >= MIN_STEP) { s.push({ ...b }); this.times[0].push(tMs); }
        // resting still: finish
        if (Math.hypot(c.x - this.anchor!.x, c.y - this.anchor!.y) > STILL_PX) { this.anchor = { ...c }; this.stillSince = tMs; }
        else if (tMs - this.stillSince >= STILL_MS) this.finish();
        break;
      }
    }
    const finish = this.mode === 'down' && this.hiddenSince === null ? Math.max(0, Math.min(1, (tMs - this.stillSince - 300) / (STILL_MS - 300))) : 0;
    return { mode: this.mode, arm: this.mode === 'arming' ? Math.min(1, (tMs - this.since) / ARM_MS) : 0, finish, brush: this.mode === 'down' ? this.brush : null, cursor: this.mode === 'idle' ? null : this.cursor, strokes: this.strokes };
  }

  /** The finished drawing (its strokes), once, or null. */
  takeFinished(): Pt[][] | null {
    const f = this.finished;
    this.finished = null;
    return f;
  }

  /** Sparkle bursts to play (pen on, drawing finished). */
  takeBursts(): Burst[] {
    const b = this.bursts;
    this.bursts = [];
    return b;
  }

  /** The hand was pulled out: drop the end of the last stroke where the fingertip slid away. */
  private trimRetreat() {
    const s = this.strokes[this.strokes.length - 1], ts = this.times[this.times.length - 1];
    if (!s || s.length < 2) return;
    const end = ts[ts.length - 1];
    let k = s.length - 1;
    while (k > 0) {
      const a = s[k - 1], b = s[k];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const backwards = this.dir ? -(dx * this.dir.x + dy * this.dir.y) / len > 0.8 : false;
      const fast = end - ts[k - 1] < RETREAT_MS && len / Math.max(1, ts[k] - ts[k - 1]) >= RETREAT_SPEED;
      if (!backwards && !fast) break;
      k--;
    }
    this.strokes[this.strokes.length - 1] = s.slice(0, k + 1);
  }

  private finish() {
    this.doneAt = this.cursor ? { ...this.cursor } : null;
    const strokes = this.strokes.filter((s) => s.length >= 2);
    if (strokes.reduce((n, s) => n + s.length, 0) >= MIN_POINTS) {
      this.finished = strokes;
      const last = strokes[strokes.length - 1];
      this.bursts.push({ kind: 'finish', at: { ...last[last.length - 1] } });
    }
    this.reset();
  }

  private reset() {
    this.hiddenSince = null;
    this.brush = null;
    this.mode = 'idle';
    this.cursor = null;
    this.strokes = [];
    this.times = [];
  }
}
