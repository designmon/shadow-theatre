import type { Pt } from '../types';

export type PenState = { mode: 'idle' | 'arming' | 'drawing'; arm: number /* 0..1 while arming */; cursor: Pt | null; stroke: Pt[] };

const ARM_MS = 1100; // hold a pointing finger this long to get the laser
const LOST_MS = 600; // finger gone this long = drawing finished
const STILL_MS = 1500; // fingertip held still this long (after drawing) = finished
const STILL_PX = 10;
const MIN_STEP = 4; // px between stored points
const SMOOTH = 0.35; // fingertip smoothing (0 = frozen, 1 = raw)
const MIN_POINTS = 8;

/** Fingertip laser: point and hold to start, move to draw, pull away or hold still to finish. */
export class LaserPen {
  private mode: PenState['mode'] = 'idle';
  private since = 0;
  private lastSeen = 0;
  private cursor: Pt | null = null;
  private stroke: Pt[] = [];
  private stillFrom: Pt | null = null;
  private stillSince = 0;
  private finished: Pt[] | null = null;

  /** `tip`: the pointing fingertip in projector px, or null when no finger is pointing. */
  update(tip: Pt | null, tMs: number): PenState {
    if (tip) this.lastSeen = tMs;
    switch (this.mode) {
      case 'idle':
        if (tip) { this.mode = 'arming'; this.since = tMs; this.cursor = { ...tip }; }
        break;
      case 'arming':
        if (!tip) { if (tMs - this.lastSeen > LOST_MS / 2) this.reset(); break; }
        this.cursor = this.follow(tip);
        if (tMs - this.since >= ARM_MS) {
          this.mode = 'drawing';
          this.stroke = [{ ...this.cursor }];
          this.stillFrom = { ...this.cursor };
          this.stillSince = tMs;
        }
        break;
      case 'drawing': {
        if (!tip) {
          if (tMs - this.lastSeen > LOST_MS) this.finish();
          break;
        }
        this.cursor = this.follow(tip);
        const last = this.stroke[this.stroke.length - 1];
        if (Math.hypot(this.cursor.x - last.x, this.cursor.y - last.y) >= MIN_STEP) this.stroke.push({ ...this.cursor });
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

  private follow(tip: Pt): Pt {
    if (!this.cursor) return { ...tip };
    return { x: this.cursor.x + (tip.x - this.cursor.x) * SMOOTH, y: this.cursor.y + (tip.y - this.cursor.y) * SMOOTH };
  }

  private finish() {
    if (this.stroke.length >= MIN_POINTS) this.finished = this.stroke;
    this.reset();
  }

  private reset() {
    this.mode = 'idle';
    this.cursor = null;
    this.stroke = [];
  }
}
