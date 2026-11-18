import type { Pt } from '../types';

/**
 * Keeps the pen on the real fingertip. The end of a finger's shadow is its faintest part, so from
 * frame to frame the finger can read shorter, then longer again — the pen would slide back along
 * the finger and out again ("backtracing"). And now and then the tip is misread somewhere else on
 * the hand for a frame or two.
 *
 * Both are judged against the palm, which is big and steady:
 *  - the finger suddenly "shorter" while pointing the same way: hold its full length for a moment
 *    (a finger really being curled is followed after that moment);
 *  - the tip jumping relative to the palm in one frame: wait until the new place has held steady.
 */
const HOLD_MS = 280; // how long a longer reading is kept
const JUMP = 46; // px (wall) in one frame, relative to the palm: not a real finger movement
const SETTLE_MS = 130; // a new place must hold this long to be believed
const SAME_WAY = 0.9; // cos of the angle: "pointing the same way"

export class TipGuard {
  private hist: { t: number; len: number; ux: number; uy: number }[] = [];
  private last: { off: Pt; t: number } | null = null;
  private pending: { off: Pt; since: number } | null = null;

  reset(): void { this.hist = []; this.last = null; this.pending = null; }

  /** The fingertip to use, or null when it can't be trusted this frame (the pen waits). */
  feed(tip: Pt, palm: Pt | null, t: number): Pt | null {
    if (!palm) return tip; // nothing to judge against
    const off = { x: tip.x - palm.x, y: tip.y - palm.y };
    const len = Math.hypot(off.x, off.y) || 1, ux = off.x / len, uy = off.y / len;
    while (this.hist.length && t - this.hist[0].t > HOLD_MS) this.hist.shift();
    // the finger reading shorter than it just was, pointing the same way: keep the full length
    let best = len;
    for (const h of this.hist) if (h.ux * ux + h.uy * uy >= SAME_WAY && h.len > best) best = h.len;
    if (best > len + 4) return { x: palm.x + ux * best, y: palm.y + uy * best };
    // a sudden jump relative to the palm?
    if (this.last && t - this.last.t < 250 && Math.hypot(off.x - this.last.off.x, off.y - this.last.off.y) > JUMP) {
      if (!this.pending || Math.hypot(off.x - this.pending.off.x, off.y - this.pending.off.y) > JUMP * 0.6) this.pending = { off, since: t };
      if (t - this.pending.since < SETTLE_MS) return null; // not believed yet
      this.hist = []; // it held: the finger really is there now
    }
    this.pending = null;
    this.last = { off, t };
    this.hist.push({ t, len, ux, uy });
    return tip;
  }
}
