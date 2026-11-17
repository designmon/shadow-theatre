import type { Pt } from '../types';

type Glint = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; spin: number; twinkle: number };

const MAX = 400;
const GOLD = ['255,206,92', '255,226,140', '255,183,77'];

/** Golden glints: a trail behind the pen tip, bursts when it starts and finishes. */
export class Sparkles {
  private g: Glint[] = [];
  private last: Pt | null = null;
  private carry = 0;
  private seed: number;

  constructor(seed = Date.now()) {
    this.seed = seed >>> 0 || 1;
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  get count(): number {
    return this.g.length;
  }

  /** How far the glints are, on average, from their centre (for tests). */
  spread(): number {
    if (!this.g.length) return 0;
    const cx = this.g.reduce((s, p) => s + p.x, 0) / this.g.length, cy = this.g.reduce((s, p) => s + p.y, 0) / this.g.length;
    return this.g.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / this.g.length;
  }

  private add(x: number, y: number, speed: number, life: number, size: number) {
    if (this.g.length >= MAX) this.g.shift();
    const a = this.rand() * Math.PI * 2, v = speed * (0.4 + this.rand() * 0.6);
    this.g.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.02, age: 0, life: life * (0.6 + this.rand() * 0.8), size: size * (0.6 + this.rand() * 0.8), spin: this.rand() * Math.PI, twinkle: this.rand() * 10 });
  }

  burst(at: Pt, n = 30): void {
    for (let i = 0; i < n; i++) this.add(at.x, at.y, 0.25, 1100, 9);
  }

  /** Glints shed behind the moving tip: more when it moves faster, none when it rests. */
  trail(tip: Pt, dtMs: number): void {
    if (this.last) {
      const moved = Math.hypot(tip.x - this.last.x, tip.y - this.last.y);
      this.carry += moved / 9;
      while (this.carry >= 1) {
        this.carry -= 1;
        const k = this.rand();
        this.add(this.last.x + (tip.x - this.last.x) * k, this.last.y + (tip.y - this.last.y) * k, 0.05, 900, 6);
      }
    }
    this.last = { ...tip };
    void dtMs;
  }

  /** The tip was lifted: the next trail starts fresh. */
  lift(): void {
    this.last = null;
    this.carry = 0;
  }

  update(dtMs: number): void {
    for (const p of this.g) {
      p.age += dtMs;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.00004 * dtMs; // slow down, settle gently
    }
    this.g = this.g.filter((p) => p.age < p.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.g) {
      const k = p.age / p.life, fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const tw = 0.6 + 0.4 * Math.sin(p.twinkle + p.age / 70);
      const r = p.size * (0.6 + 0.4 * tw) * (1 - k * 0.5);
      const c = GOLD[Math.floor(p.twinkle) % GOLD.length];
      // soft glow
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.8);
      g.addColorStop(0, `rgba(${c},${0.55 * fade})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
      // four-point star
      ctx.fillStyle = `rgba(${c},${fade})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = p.spin + (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.28 : r;
        ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
