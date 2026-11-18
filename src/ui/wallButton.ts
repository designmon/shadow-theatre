import type { Pt } from '../types';

/**
 * A button projected on the wall, pressed with your hand's shadow: make a fist over it and open
 * your hand again (a quick "click"). Drawn in the ink blue, so the camera never takes it for a
 * shadow; a ring shows when your hand is over it.
 */
export class WallButton {
  on = false; // e.g. paused
  private hoverAt: number | null = null;
  private pressAt: number | null = null;
  private flashAt = -Infinity;
  private armed = true; // after a click, the hand must leave before the next one

  constructor(private readonly labels: [string, string], private readonly icon: (ctx: CanvasRenderingContext2D, on: boolean, r: number) => void) {}

  /** Where it sits (top-right corner of the wall). */
  centre(wall: { w: number; h: number }): Pt {
    return { x: wall.w - 110, y: 110 }; // in from the corner, so a fist over it needn't touch the picture's edge
  }
  readonly r = 26;
  /** Generous: a hand's shadow is big and not exact. */
  hit(p: Pt, wall: { w: number; h: number }): boolean {
    const c = this.centre(wall);
    return Math.hypot(p.x - c.x, p.y - c.y) < 120;
  }

  /** Feed the hand: where its shadow is and whether it is a fist. Returns true on a click. */
  feed(p: Pt | null, fist: boolean, wall: { w: number; h: number }, now: number): boolean {
    const over = !!p && this.hit(p, wall);
    this.hoverAt = over ? this.hoverAt ?? now : null;
    if (!over && !fist) this.armed = true;
    if (!this.armed) return false;
    if (over && fist) { if (this.pressAt === null) this.pressAt = now; return false; }
    // released (hand opened, or left) within a moment of closing it over the button: a click
    const pressed = this.pressAt;
    if (!fist) this.pressAt = null;
    if (pressed !== null && !fist && now - pressed >= 150 && now - pressed < 1500) {
      this.on = !this.on;
      this.flashAt = now;
      this.armed = false;
      return true;
    }
    if (!over && !fist) this.pressAt = null;
    return false;
  }

  /** Clicked (by the hand's click detector): toggle, with a flash. */
  click(now: number): void {
    this.on = !this.on;
    this.flashAt = now;
  }
  /** Is a hand over it (so the pen shouldn't start here)? */
  get hovered(): boolean { return this.hoverAt !== null; }

  draw(ctx: CanvasRenderingContext2D, wall: { w: number; h: number }, ink: string, accent: (k: number) => string, now: number): void {
    const c = this.centre(wall), pressed = this.pressAt !== null;
    const flash = Math.max(0, 1 - (now - this.flashAt) / 500);
    ctx.save();
    ctx.translate(c.x, c.y);
    const s = pressed ? 0.88 : 1;
    ctx.scale(s, s);
    ctx.strokeStyle = ctx.fillStyle = ink;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke();
    this.icon(ctx, this.on, this.r);
    if (this.hoverAt !== null || flash > 0) {
      const k = this.hoverAt !== null ? Math.min(1, (now - this.hoverAt) / 300) : 0;
      ctx.strokeStyle = `rgba(${accent((Math.sin(now / 500) + 1) / 2)},${Math.max(0.7 * k, flash)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 10 + flash * 14, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ink;
    ctx.font = '300 13px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.14em';
    ctx.fillText((this.on ? this.labels[1] : this.labels[0]).toUpperCase(), 0, this.r + 24);
    ctx.restore();
  }
}

/** Pause ⏸ / play ▶ icon. */
export function pauseIcon(ctx: CanvasRenderingContext2D, paused: boolean, r: number): void {
  if (paused) {
    ctx.beginPath(); ctx.moveTo(-r * 0.28, -r * 0.4); ctx.lineTo(r * 0.45, 0); ctx.lineTo(-r * 0.28, r * 0.4); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(-r * 0.3, -r * 0.38, r * 0.2, r * 0.76);
    ctx.fillRect(r * 0.1, -r * 0.38, r * 0.2, r * 0.76);
  }
}
