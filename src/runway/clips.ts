import { INK_COLOR } from '../draw/render';
import type { Box } from '../types';

/**
 * A Runway clip, projected shadow-safe. Black lines on the wall read as shadows, so every frame
 * is recoloured on the GPU before it reaches the wall:
 *   1. greyscale with extra contrast (an off-white background becomes white),
 *   2. `screen` the ink blue over it (white stays white, black becomes ink blue),
 *   3. `multiply` onto the wall (white leaves the wall and anything under it as it is).
 * Every pixel keeps full blue light, so the camera reads it as lit wall, never as a shadow.
 */
export class ClipPlayer {
  readonly video: HTMLVideoElement;
  private off: OffscreenCanvas | null = null;
  private playing = false;

  constructor(readonly url: string) {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.loop = false;
    v.load();
    this.video = v;
  }

  start(): void {
    this.playing = true;
    try { this.video.currentTime = 0; } catch { /* not loaded yet */ }
    void this.video.play().catch(() => { /* will show nothing; the drawing comes back at the end */ });
  }

  get ended(): boolean {
    return this.playing && (this.video.ended || !!this.video.error);
  }

  get remainingMs(): number {
    const d = this.video.duration;
    return Number.isFinite(d) ? Math.max(0, (d - this.video.currentTime) * 1000) : Infinity;
  }

  /** Draw the current frame into `rect` (a 16:9 box), recoloured, at `alpha`. */
  draw(ctx: CanvasRenderingContext2D, rect: Box, alpha: number): void {
    const v = this.video;
    if (alpha <= 0 || v.readyState < 2 || !v.videoWidth) return;
    if (!(ctx.canvas instanceof HTMLCanvasElement)) return; // only onto the wall (not the camera-mask passes)
    // the clip keeps its own shape: fit its width to the box, centred (Runway keeps 16:9)
    const h = rect.w * (v.videoHeight / v.videoWidth), r = { x: rect.x, y: rect.y + (rect.h - h) / 2, w: rect.w, h };
    const W = Math.max(2, Math.min(1280, Math.round(r.w))), H = Math.max(2, Math.round((W * r.h) / r.w));
    if (!this.off || this.off.width !== W || this.off.height !== H) this.off = new OffscreenCanvas(W, H);
    const o = this.off.getContext('2d')! as unknown as CanvasRenderingContext2D;
    o.globalCompositeOperation = 'source-over';
    o.filter = 'grayscale(1) contrast(1.7) brightness(1.06)';
    o.drawImage(v, 0, 0, W, H);
    o.filter = 'none';
    o.globalCompositeOperation = 'screen';
    o.fillStyle = INK_COLOR;
    o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = alpha;
    ctx.filter = 'none';
    ctx.drawImage(this.off, r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

export type ClipEvent = { file: string; url: string; initial: boolean };
/** Phase 2: a clip being generated for an export (the drawing shimmers), or a failure. */
export type RunwayStatus = { pending: string } | { failed: string; why: string };

/** Clips dropped into captures/runway-out/, as the server announces them. */
export function watchClips(onClip: (e: ClipEvent) => void, onStatus: (s: RunwayStatus) => void = () => {}): () => void {
  const es = new EventSource('/api/runway/events');
  es.onmessage = (m) => {
    try {
      const msg = JSON.parse(m.data);
      if (msg.file) onClip(msg as ClipEvent); else onStatus(msg as RunwayStatus);
    } catch { /* ignore */ }
  };
  return () => es.close();
}
