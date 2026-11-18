import type { Pt } from '../types';
import { OneEuro2D } from './oneEuro';

export type PenInput = { tip: Pt; pose: 'point' | 'fist' | 'open'; dir?: Pt };
export type PenState = { mode: 'idle' | 'arming' | 'down' | 'up'; arm: number /* 0..1 while arming */; finish: number /* 0..1 while a fist is held */; cursor: Pt | null; brush?: Pt | null /* where the ink is (trails the fingertip) */; strokes: Pt[][] };
export type Burst = { kind: 'start' | 'finish'; at: Pt };

const ARM_MS = 350; // point (and hold roughly still) this long to turn the pen on
const ARM_STILL = 22; // px: reaching in while pointing doesn't draw a line from the edge
const POSE_MS = 130; // a pose must hold this long before the pen reacts (no flicker)
const UP_MS = 600; // lifting the pen mid-line needs a clearly open hand, not a flicker of the pose
const FIST_MS = 160; // curling the finger (a fist) lifts the pen this quickly...
const FINISH_MS = 1300; // ...and held this long, finishes the drawing
const LOST_MS = 800; // hand out of the light this long = finished
const MIN_STEP = 3; // px between stored points
const STRING = 10; // px: the lazy brush — ink trails the fingertip on a short string, so a tremor never reaches the line
const MIN_POINTS = 8;
const MAX_JUMP = 90; // px in one frame: a fingertip can't teleport; such a frame is a glitch
const RETREAT_SPEED = 1.0; // px/ms: the hand being pulled out of the light, not drawing
const RETREAT_MS = 600;

/**
 * Fingertip pen, driven by the hand: point to draw, open the hand to lift the pen (move without
 * drawing, then point again for the next stroke), close it into a fist to finish.
 */
export class LaserPen {
  private mode: PenState['mode'] = 'idle';
  private since = 0;
  private lastSeen = 0;
  private cursor: Pt | null = null;
  private strokes: Pt[][] = [];
  private times: number[][] = [];
  private finished: Pt[][] | null = null;
  private bursts: Burst[] = [];
  private filt = new OneEuro2D(1.1, 0.03);
  private dir: Pt | null = null;
  private lastTip: Pt | null = null;
  private anchor: Pt | null = null; // where arming started
  private lastTipT = -Infinity;
  private pose: PenInput['pose'] | null = null; // the settled pose
  private seenPose: PenInput['pose'] | null = null; // the latest raw pose
  private seenSince = 0;
  private fistSince: number | null = null;
  private brush: Pt | null = null;

  update(input: PenInput | null, tMs: number): PenState {
    let tip = input?.tip ?? null;
    if (tip && this.lastTip && tMs - this.lastTipT < 200 && Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y) > MAX_JUMP) tip = null; // glitch
    else if (tip) { this.lastTip = { ...tip }; this.lastTipT = tMs; }
    if (input?.dir) this.dir = input.dir;
    if (tip) {
      this.lastSeen = tMs;
      this.cursor = this.filt.filter(tip, tMs);
      // settle the pose: it has to hold a moment before the pen reacts
      if (input!.pose !== this.seenPose) { this.seenPose = input!.pose; this.seenSince = tMs; }
      const need = this.seenPose === 'fist' ? FIST_MS : this.seenPose === 'open' && this.mode === 'down' ? UP_MS : POSE_MS;
      if (tMs - this.seenSince >= need) this.pose = this.seenPose;
    }

    switch (this.mode) {
      case 'idle':
        if (tip && input!.pose === 'point') { this.mode = 'arming'; this.since = tMs; this.anchor = { ...tip }; this.filt = new OneEuro2D(1.1, 0.03); this.cursor = this.filt.filter(tip, tMs); }
        break;
      case 'arming':
        if (!tip || input!.pose !== 'point') { if (!tip ? tMs - this.lastSeen > 250 : true) this.reset(); break; }
        if (Math.hypot(tip.x - this.anchor!.x, tip.y - this.anchor!.y) > ARM_STILL) { this.anchor = { ...tip }; this.since = tMs; break; } // still moving in
        if (tMs - this.since >= ARM_MS) {
          this.mode = 'down';
          this.strokes = [[{ ...this.cursor! }]];
          this.brush = { ...this.cursor! };
          this.times = [[tMs]];
          this.pose = 'point';
          this.bursts.push({ kind: 'start', at: { ...this.cursor! } });
        }
        break;
      case 'down':
      case 'up':
        if (!tip) {
          if (tMs - this.lastSeen > LOST_MS) { this.trimRetreat(); this.finish(); }
          break;
        }
        // curl the finger (fist): the pen lifts; point again for the next stroke (eyes, whiskers);
        // keep the fist closed a moment longer to finish the drawing
        if (this.pose === 'fist') {
          if (this.fistSince === null) this.fistSince = tMs;
          this.mode = 'up';
          if (tMs - this.fistSince >= FINISH_MS) this.finish();
          break;
        }
        this.fistSince = null;
        if (this.pose === 'point') {
          if (this.mode === 'up') { this.strokes.push([]); this.times.push([]); this.mode = 'down'; this.brush = null; }
          const s = this.strokes[this.strokes.length - 1], last = s[s.length - 1];
          // the hand just opened (maybe lifting): pause, don't draw where it moves; a flicker resumes the line
          if (this.seenPose !== 'point') break;
          // lazy brush: the ink only moves when the fingertip pulls the string taut
          const c = this.cursor!;
          if (!this.brush) this.brush = { ...c };
          else {
            const dx = c.x - this.brush.x, dy = c.y - this.brush.y, d = Math.hypot(dx, dy);
            if (d > STRING) { const k = (d - STRING) / d; this.brush = { x: this.brush.x + dx * k, y: this.brush.y + dy * k }; }
          }
          const b = this.brush;
          if (!last || Math.hypot(b.x - last.x, b.y - last.y) >= MIN_STEP) { s.push({ ...b }); this.times[this.times.length - 1].push(tMs); }
        } else if (this.mode === 'down') this.mode = 'up';
        break;
    }
    const finish = this.fistSince !== null && this.mode === 'up' ? Math.min(1, (tMs - this.fistSince) / FINISH_MS) : 0;
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
    const strokes = this.strokes.filter((s) => s.length >= 2);
    if (strokes.reduce((n, s) => n + s.length, 0) >= MIN_POINTS) {
      this.finished = strokes;
      const last = strokes[strokes.length - 1];
      this.bursts.push({ kind: 'finish', at: { ...last[last.length - 1] } });
    }
    this.reset();
  }

  private reset() {
    this.fistSince = null;
    this.brush = null;
    this.mode = 'idle';
    this.cursor = null;
    this.strokes = [];
    this.times = [];
    this.pose = null;
    this.seenPose = null;
  }
}
