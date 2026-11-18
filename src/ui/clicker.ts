import type { Pt } from '../types';

/**
 * A click made with your hand's shadow: close your hand into a fist (over something) and open it
 * again, quickly. Returns where the fist was. Too short (a flicker) or too long (holding) isn't a
 * click, and right after a click the next one waits a moment (the hand flickers as it opens).
 */
export class Clicker {
  private pressAt: number | null = null;
  private pressPos: Pt | null = null;
  private lastClick = -Infinity;
  /** Where a fist is being held right now (for a "pressed" look). */
  get pressing(): Pt | null { return this.pressPos; }

  feed(p: Pt | null, fist: boolean, now: number): Pt | null {
    if (fist && p) {
      if (this.pressAt === null) { this.pressAt = now; this.pressPos = { ...p }; }
      else this.pressPos = { x: this.pressPos!.x * 0.7 + p.x * 0.3, y: this.pressPos!.y * 0.7 + p.y * 0.3 };
      return null;
    }
    const at = this.pressAt, pos = this.pressPos;
    this.pressAt = null;
    this.pressPos = null;
    if (at === null || !pos) return null;
    const held = now - at;
    if (held < 150 || held > 1500 || now - this.lastClick < 900) return null;
    this.lastClick = now;
    return pos;
  }
}
