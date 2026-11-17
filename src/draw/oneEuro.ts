import type { Pt } from '../types';

/**
 * One Euro filter (Casiez et al., 2012): strong smoothing when the pointer is slow (no
 * jitter), little smoothing when it's fast (no lag). The standard for shaky pointing input.
 */
class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;
  constructor(private minCutoff = 1.0, private beta = 0.02, private dCutoff = 1.0) {}

  filter(v: number, tMs: number): number {
    if (this.x === null || this.t === null) { this.x = v; this.t = tMs; return v; }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const rawDx = (v - this.x) / dt;
    this.dx += alpha(this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff) * (v - this.x);
    return this.x;
  }
}

export class OneEuro2D {
  private fx: OneEuro;
  private fy: OneEuro;
  constructor(minCutoff = 1.0, beta = 0.02) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
  }
  filter(p: Pt, tMs: number): Pt {
    return { x: this.fx.filter(p.x, tMs), y: this.fy.filter(p.y, tMs) };
  }
}
