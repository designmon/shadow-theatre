import type { Box, Pt } from '../types';

/**
 * In the top-right corner: a small microphone ("wave to talk"); while listening, a hand-drawn
 * sound wave that moves with your voice, what it has heard so far, and a send button (a quick fist
 * on it, or a stop sign with your hand). Ink blue, like everything on the wall.
 */
export type ListenState = { listening: boolean; thinking: boolean; text: string; level: number; error: string | null; stop: number /* 0..1 stop sign held */ };

const FONT = '300 15px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
let smooth = 0;

export class ListeningUI {
  private sendBox: Box | null = null;

  /** Where it sits: the top-right corner of the wall. */
  centre(wall: { w: number; h: number }): Pt { return { x: wall.w - 170, y: 100 }; }

  hitSend(p: Pt): boolean {
    const b = this.sendBox;
    return !!b && p.x > b.x - 40 && p.x < b.x + b.w + 40 && p.y > b.y - 40 && p.y < b.y + b.h + 40;
  }
  /** Is the hand over it (so the pen doesn't start here)? */
  near(p: Pt, wall: { w: number; h: number }): boolean {
    const c = this.centre(wall);
    return Math.abs(p.x - c.x) < 200 && Math.abs(p.y - c.y) < 110;
  }

  draw(ctx: CanvasRenderingContext2D, wall: { w: number; h: number }, s: ListenState, ink: string, now: number): void {
    const c = this.centre(wall);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = FONT;
    ctx.textAlign = 'center';
    if (!s.listening && !s.thinking) {
      // idle: a small microphone and a hint
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(c.x - 6, c.y - 16, 12, 20, 6); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y - 2, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x, c.y + 9); ctx.lineTo(c.x, c.y + 14); ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.letterSpacing = '0.12em';
      ctx.font = '300 12px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
      ctx.fillText('WAVE TO TALK', c.x, c.y + 36);
      ctx.restore();
      this.sendBox = null;
      return;
    }
    // the wave: three loose, slightly jittery strokes, like pencil lines
    smooth = smooth * 0.8 + (s.thinking ? 0.15 : s.level) * 0.2;
    const W = 230, amp = 6 + smooth * 34;
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.85 - k * 0.22;
      ctx.lineWidth = 2.2 - k * 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 46; i++) {
        const u = i / 46, x = c.x - W / 2 + u * W, env = Math.sin(Math.PI * u);
        const y = c.y - 12 + Math.sin(u * 14 + now / (160 + k * 40) + k) * amp * env * (0.7 + 0.3 * Math.sin(now / 300 + i)) + Math.sin(i * 12.9 + k * 3 + Math.floor(now / 90)) * 1.2;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // what it heard (or why not)
    ctx.globalAlpha = 0.9;
    const said = s.error ? s.error : s.thinking ? 'making it happen…' : s.text || 'listening…';
    const line = said.length > 46 ? '…' + said.slice(-45) : said;
    ctx.fillText(line, c.x, c.y + 30);
    // send
    if (s.listening) {
      ctx.font = '400 13px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
      ctx.letterSpacing = '0.12em';
      const b = { x: c.x - 38, y: c.y + 44, w: 76, h: 28 };
      this.sendBox = b;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 14); ctx.stroke();
      ctx.fillText('SEND', c.x, b.y + 19);
      if (s.stop > 0) {
        // the stop sign being held: a ring around send fills
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(c.x, b.y + b.h / 2, 30, -Math.PI / 2, -Math.PI / 2 + s.stop * Math.PI * 2); ctx.stroke();
      }
    } else this.sendBox = null;
    ctx.restore();
  }
}
