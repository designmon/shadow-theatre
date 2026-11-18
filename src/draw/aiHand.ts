import type { Pt } from '../types';

/**
 * The AI's pen: it comes in from the side of the wall, draws something stroke by stroke and goes
 * away again. White with an ink outline, so the camera never takes it for a shadow.
 */
const SPEED = 0.55; // px/ms while drawing
const HOP = 1.1; // px/ms between strokes (finger lifted)
const ENTER_MS = 900, EXIT_MS = 800;

export class AiArtist {
  private strokes: Pt[][] = [];
  private lens: number[] = [];
  private t = 0;
  private phase: 'idle' | 'enter' | 'draw' | 'exit' = 'idle';
  private phaseAt = 0;
  private seg = 0; // which stroke
  private along = 0; // px along it
  private hopFrom: Pt | null = null;
  private hopAt = 0;
  private from: Pt = { x: 0, y: 0 };
  private tip: Pt = { x: 0, y: 0 };
  private done: ((strokes: Pt[][]) => void) | null = null;

  get busy(): boolean { return this.phase !== 'idle'; }

  /** Draw these strokes (wall px), coming in from `side`; `onDone` gets them when the hand has gone. */
  start(strokes: Pt[][], wall: { w: number; h: number }, onDone: (strokes: Pt[][]) => void): void {
    this.strokes = strokes.filter((s) => s.length >= 2);
    this.lens = this.strokes.map((s) => s.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - s[i].x, p.y - s[i].y), 0));
    this.seg = 0; this.along = 0; this.hopFrom = null;
    const first = this.strokes[0]?.[0] ?? { x: wall.w / 2, y: wall.h / 2 };
    this.from = { x: first.x < wall.w / 2 ? -150 : wall.w + 150, y: first.y + 120 };
    this.tip = { ...this.from };
    this.phase = 'enter';
    this.phaseAt = this.t;
    this.done = onDone;
  }

  update(dt: number): void {
    this.t += dt;
    const since = this.t - this.phaseAt;
    if (this.phase === 'enter') {
      const k = Math.min(1, since / ENTER_MS), e = 1 - (1 - k) ** 3, to = this.strokes[0][0];
      this.tip = { x: this.from.x + (to.x - this.from.x) * e, y: this.from.y + (to.y - this.from.y) * e };
      if (k >= 1) { this.phase = 'draw'; this.phaseAt = this.t; }
    } else if (this.phase === 'draw') {
      if (this.hopFrom) {
        // finger lifted, moving to the next stroke
        const to = this.strokes[this.seg][0], d = Math.hypot(to.x - this.hopFrom.x, to.y - this.hopFrom.y), k = Math.min(1, ((this.t - this.hopAt) * HOP) / Math.max(1, d));
        this.tip = { x: this.hopFrom.x + (to.x - this.hopFrom.x) * k, y: this.hopFrom.y + (to.y - this.hopFrom.y) * k };
        if (k >= 1) this.hopFrom = null;
        return;
      }
      this.along += dt * SPEED;
      if (this.along >= this.lens[this.seg]) {
        const end = this.strokes[this.seg][this.strokes[this.seg].length - 1];
        this.seg++;
        this.along = 0;
        if (this.seg >= this.strokes.length) { this.tip = end; this.phase = 'exit'; this.phaseAt = this.t; this.from = { ...end }; return; }
        this.hopFrom = end; this.hopAt = this.t;
        return;
      }
      this.tip = this.pointAt(this.seg, this.along);
    } else if (this.phase === 'exit') {
      const k = Math.min(1, since / EXIT_MS), e = k * k, out = { x: this.from.x < 960 ? -200 : 2400, y: this.from.y + 200 };
      this.tip = { x: this.from.x + (out.x - this.from.x) * e, y: this.from.y + (out.y - this.from.y) * e };
      if (k >= 1) { this.phase = 'idle'; const f = this.done; this.done = null; f?.(this.strokes); }
    }
  }

  private pointAt(seg: number, along: number): Pt {
    const s = this.strokes[seg];
    let left = along;
    for (let i = 1; i < s.length; i++) {
      const d = Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
      if (left <= d) { const f = left / Math.max(1e-6, d); return { x: s[i - 1].x + (s[i].x - s[i - 1].x) * f, y: s[i - 1].y + (s[i].y - s[i - 1].y) * f }; }
      left -= d;
    }
    return s[s.length - 1];
  }

  draw(ctx: CanvasRenderingContext2D, ink: string, accent: string): void {
    if (this.phase === 'idle') return;
    // the ink so far
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const upto = this.phase === 'exit' ? this.strokes.length : this.seg;
    for (let i = 0; i <= Math.min(upto, this.strokes.length - 1); i++) {
      const s = this.strokes[i];
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      if (i < upto) for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      else if (!this.hopFrom && this.phase === 'draw') {
        let left = this.along;
        for (let j = 1; j < s.length && left > 0; j++) {
          const d = Math.hypot(s[j].x - s[j - 1].x, s[j].y - s[j - 1].y);
          if (left >= d) { ctx.lineTo(s[j].x, s[j].y); left -= d; } else { const f = left / d; ctx.lineTo(s[j - 1].x + (s[j].x - s[j - 1].x) * f, s[j - 1].y + (s[j].y - s[j - 1].y) * f); left = 0; }
        }
      }
      ctx.stroke();
    }
    // the pen: slim, tilted, its nib on the line; white with an ink outline (never a "shadow")
    const { x, y } = this.tip;
    ctx.translate(x, y);
    const wobble = this.phase === 'draw' && !this.hopFrom ? Math.sin(this.t / 90) * 0.03 : 0;
    ctx.rotate(0.62 + wobble); // leaning to the right, like a pen in a hand
    if (this.hopFrom) ctx.translate(0, -10); // lifted between strokes
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
    g.addColorStop(0, `rgba(${accent},0.4)`); g.addColorStop(1, `rgba(${accent},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    // nib
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -20); ctx.lineTo(6, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    // grip
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-9, -44); ctx.lineTo(9, -44); ctx.lineTo(6, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    // barrel
    ctx.beginPath(); ctx.roundRect(-9, -168, 18, 124, [9, 9, 0, 0]); ctx.fill(); ctx.stroke();
    // a band in the accent colour, and a clip
    ctx.fillStyle = `rgb(${accent})`;
    ctx.fillRect(-9, -58, 18, 9); ctx.strokeRect(-9, -58, 18, 9);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(4, -160); ctx.lineTo(4, -112); ctx.stroke();
    ctx.restore();
  }
}
