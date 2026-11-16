const LOW_SCORE = 0.5;
const DISAGREE_MS = 1000;
const BACKOFF_MS = 10000;

/**
 * Decides when the projector has really moved: our steady creatures must be
 * missing from the camera image for a full second (not a number of frames),
 * and after a failed recalibration we back off for 10 s instead of strobing.
 */
export class MisalignmentWatch {
  private since: number | null = null;
  private blockedUntil = -Infinity;

  /** `score` null = nothing steady to check this frame. Returns true when it's time to recalibrate. */
  push(score: number | null, tMs: number): boolean {
    if (tMs < this.blockedUntil || score === null || score >= LOW_SCORE) {
      this.since = null;
      return false;
    }
    this.since ??= tMs;
    if (tMs - this.since < DISAGREE_MS) return false;
    this.since = null;
    return true;
  }

  failed(tMs: number): void {
    this.blockedUntil = tMs + BACKOFF_MS;
    this.since = null;
  }
}

export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, ms);
  };
}
