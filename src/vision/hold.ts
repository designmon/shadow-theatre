import type { Mask } from '../types';

export function iou(a: Mask, b: Mask): number {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i], y = b.data[i];
    inter += x & y;
    uni += x | y;
  }
  return uni === 0 ? 0 : inter / uni;
}

/** Fires once when the puppet shape has been held still for `holdMs`. */
export class HoldDetector {
  private holdMs: number;
  private minIou: number;
  private cooldownMs: number;
  private ref: Mask | null = null;
  private since = 0;
  private fired = false;
  private lastFire = -Infinity;
  private firedRef: Mask | null = null;
  /** After a fire, a new hold must differ this much from the fired shape (IoU below). */
  private static REARM_IOU = 0.3;

  constructor(opts: { holdMs?: number; minIou?: number; cooldownMs?: number } = {}) {
    this.holdMs = opts.holdMs ?? 700;
    this.minIou = opts.minIou ?? 0.85;
    this.cooldownMs = opts.cooldownMs ?? 1500;
  }

  push(puppet: Mask, tMs: number): boolean {
    // once the fired pose has clearly been left, the next pose may fire (even in the same spot)
    if (this.firedRef && iou(this.firedRef, puppet) < HoldDetector.REARM_IOU) this.firedRef = null;
    if (!this.ref || iou(this.ref, puppet) < this.minIou) {
      this.ref = puppet;
      this.since = tMs;
      this.fired = false;
      return false;
    }
    if (this.fired || tMs - this.since < this.holdMs || tMs - this.lastFire < this.cooldownMs) return false;
    if (this.firedRef && iou(this.firedRef, puppet) >= HoldDetector.REARM_IOU) return false;
    this.fired = true;
    this.firedRef = puppet;
    this.lastFire = tMs;
    return true;
  }

  reset(): void {
    this.ref = null;
    this.firedRef = null;
    this.fired = false;
  }
}
