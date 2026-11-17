import type { Pt } from '../types';
import { OneEuro2D } from './oneEuro';

export type PenState = { mode: 'idle' | 'arming' | 'drawing'; arm: number /* 0..1 while arming */; cursor: Pt | null; stroke: Pt[] };
export type Burst = { kind: 'start' | 'finish'; at: Pt };

const ARM_MS = 800; // hold the fingertip still this long to start drawing
const ARM_STILL_PX = 14; // "still" while arming
const LOST_MS = 600; // hand gone this long = drawing finished
const STILL_MS = 1200; // fingertip held still this long (after drawing) = finished
const STILL_PX = 10;
const MIN_STEP = 3; // px between stored points
const MIN_POINTS = 8;
const RETREAT_SPEED = 1.0; // px/ms: the hand being pulled out of the light, not drawing
const RETREAT_MS = 600; // only look this far back

/** Fingertip pen: hold still to start, move to draw (smoothed live), pull away or hold still to finish. */
export class LaserPen {
  private mode: PenState['mode'] = 'idle';
  private since = 0;
  private lastSeen = 0;
  private cursor: Pt | null = null;
  private anchor: Pt | null = null;
  private stroke: Pt[] = [];
  private strokeT: number[] = [];
  private dir: Pt | null = null; // which way the finger points
  private stillFrom: Pt | null = null;
  private stillSince = 0;
  private finished: Pt[] | null = null;
  private bursts: Burst[] = [];
  private filt = new OneEuro2D(1.2, 0.02);

  /** `tip`: the fingertip in projector px, or null when no hand is in the light. */
  update(tip: Pt | null, tMs: number, dir?: Pt): PenState {
    if (dir) this.dir = dir;
    if (tip) this.lastSeen = tMs;
    switch (this.mode) {
      case 'idle':
        if (tip) { this.mode = 'arming'; this.since = tMs; this.anchor = { ...tip }; this.filt = new OneEuro2D(1.2, 0.02); this.cursor = this.filt.filter(tip, tMs); }
        break;
      case 'arming':
        if (!tip) { if (tMs - this.lastSeen > LOST_MS / 2) this.reset(); break; }
        this.cursor = this.filt.filter(tip, tMs);
        if (Math.hypot(tip.x - this.anchor!.x, tip.y - this.anchor!.y) > ARM_STILL_PX) { this.anchor = { ...tip }; this.since = tMs; }
        else if (tMs - this.since >= ARM_MS) {
          this.mode = 'drawing';
          this.stroke = [{ ...this.cursor }];
          this.strokeT = [tMs];
          this.stillFrom = { ...this.cursor };
          this.stillSince = tMs;
          this.bursts.push({ kind: 'start', at: { ...this.cursor } });
        }
        break;
      case 'drawing': {
        if (!tip) {
          if (tMs - this.lastSeen > LOST_MS) this.finish(true);
          break;
        }
        this.cursor = this.filt.filter(tip, tMs);
        const last = this.stroke[this.stroke.length - 1];
        if (Math.hypot(this.cursor.x - last.x, this.cursor.y - last.y) >= MIN_STEP) { this.stroke.push({ ...this.cursor }); this.strokeT.push(tMs); }
        if (Math.hypot(this.cursor.x - this.stillFrom!.x, this.cursor.y - this.stillFrom!.y) > STILL_PX) {
          this.stillFrom = { ...this.cursor };
          this.stillSince = tMs;
        } else if (tMs - this.stillSince > STILL_MS && this.stroke.length >= MIN_POINTS) this.finish();
        break;
      }
    }
    return { mode: this.mode, arm: this.mode === 'arming' ? Math.min(1, (tMs - this.since) / ARM_MS) : 0, cursor: this.mode === 'idle' ? null : this.cursor, stroke: this.stroke };
  }

  /** The finished drawing (once), or null. */
  takeFinished(): Pt[] | null {
    const f = this.finished;
    this.finished = null;
    return f;
  }

  /** Sparkle bursts to play (start of drawing, finish). */
  takeBursts(): Burst[] {
    const b = this.bursts;
    this.bursts = [];
    return b;
  }

  /**
   * The hand was pulled out: drop the end of the line where the fingertip slid away — moving
   * backwards along the finger (any speed), or a fast dash just before it vanished.
   */
  private trimRetreat() {
    const n = this.stroke.length, end = this.strokeT[n - 1];
    let k = n - 1;
    while (k > 0) {
      const a = this.stroke[k - 1], b = this.stroke[k];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const backwards = this.dir ? -(dx * this.dir.x + dy * this.dir.y) / len > 0.8 : false;
      const fast = end - this.strokeT[k - 1] < RETREAT_MS && len / Math.max(1, this.strokeT[k] - this.strokeT[k - 1]) >= RETREAT_SPEED;
      if (!backwards && !fast) break;
      k--;
    }
    this.stroke = this.stroke.slice(0, k + 1);
    this.strokeT = this.strokeT.slice(0, k + 1);
  }

  private finish(handLeft = false) {
    if (handLeft) this.trimRetreat();
    if (this.stroke.length >= MIN_POINTS) {
      this.finished = this.stroke;
      this.bursts.push({ kind: 'finish', at: { ...this.stroke[this.stroke.length - 1] } });
    }
    this.reset();
  }

  private reset() {
    this.mode = 'idle';
    this.cursor = null;
    this.stroke = [];
  }
}
