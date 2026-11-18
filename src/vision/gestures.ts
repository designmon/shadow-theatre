import type { Pt } from '../types';

/**
 * Two hand gestures for voice commands:
 * - a wave (an open hand moving side to side a few times) starts listening;
 * - a stop sign (an open palm, held still) stops listening and sends what you said.
 */
export class WaveDetector {
  private xs: { x: number; t: number }[] = [];

  /** Feed the hand each frame (null = no hand). Returns true once when a wave is seen. */
  feed(p: Pt | null, open: boolean, now: number, minSwing = 40): boolean {
    if (!p || !open) { this.xs = []; return false; }
    this.xs.push({ x: p.x, t: now });
    while (this.xs.length && now - this.xs[0].t > 1600) this.xs.shift();
    // turning points of the side-to-side motion, each swing at least minSwing px
    let turns = 0, dir = 0, hi = -Infinity, lo = Infinity;
    for (const { x } of this.xs) {
      hi = Math.max(hi, x); lo = Math.min(lo, x);
      if (dir >= 0 && hi - x >= minSwing) { if (dir > 0) turns++; dir = -1; lo = x; hi = x; }
      else if (dir <= 0 && x - lo >= minSwing) { if (dir < 0) turns++; dir = 1; hi = x; lo = x; }
    }
    if (turns >= 3) { this.xs = []; return true; }
    return false;
  }
}

export class StopSign {
  private since: number | null = null;
  private at: Pt | null = null;
  private armed = false;

  /** After the wave, the hand has to drop (or change) once before a stop sign counts. */
  reset(): void { this.armed = false; this.since = null; }

  /** Returns true once when an open palm has been held still for holdMs. */
  feed(p: Pt | null, open: boolean, now: number, holdMs = 800): boolean {
    if (!p || !open) { this.armed = true; this.since = null; return false; }
    if (!this.armed) return false;
    if (!this.at || Math.hypot(p.x - this.at.x, p.y - this.at.y) > 30) { this.at = { ...p }; this.since = now; return false; }
    if (this.since !== null && now - this.since >= holdMs) { this.since = null; this.armed = false; return true; }
    return false;
  }
  /** 0..1 while the palm is held (for a ring that fills). */
  progress(now: number, holdMs = 800): number {
    return this.armed && this.since !== null ? Math.min(1, (now - this.since) / holdMs) : 0;
  }
}
