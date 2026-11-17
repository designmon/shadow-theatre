import type { Pt } from '../types';

type Glint = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; spin: number; twinkle: number };
type Ring = { x: number; y: number; age: number; life: number; r: number };

const MAX = 400;
import { accentAt } from './render';

/** Golden glints: a trail behind the pen tip, bursts when it starts and finishes. */
export class Sparkles {
  private g: Glint[] = [];
  private rings: Ring[] = [];
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

  /** A single expanding hairline ring and a few specks: understated, not confetti. */
  burst(at: Pt, n = 14, ringRadius = 90): void {
    this.rings.push({ x: at.x, y: at.y, age: 0, life: 900, r: ringRadius });
    for (let i = 0; i < n; i++) this.add(at.x, at.y, 0.18, 1000, 3.5);
  }

  /** Glints shed behind the moving tip: more when it moves faster, none when it rests. */
  trail(tip: Pt, dtMs: number): void {
    if (this.last) {
      const moved = Math.hypot(tip.x - this.last.x, tip.y - this.last.y);
      this.carry += moved / 26; // sparing: a speck every ~26 px
      while (this.carry >= 1) {
        this.carry -= 1;
        const k = this.rand();
        this.add(this.last.x + (tip.x - this.last.x) * k, this.last.y + (tip.y - this.last.y) * k, 0.035, 1100, 2.6);
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
    for (const r of this.rings) r.age += dtMs;
    this.rings = this.rings.filter((r) => r.age < r.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.filter = 'none';
    for (const r of this.rings) {
      const k = r.age / r.life, e = 1 - (1 - k) ** 3;
      ctx.strokeStyle = `rgba(${accentAt(k)},${(1 - k) * 0.9})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, 10 + r.r * e, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of this.g) {
      const k = p.age / p.life, fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const tw = 0.6 + 0.4 * Math.sin(p.twinkle + p.age / 90);
      ctx.fillStyle = `rgba(${accentAt((p.twinkle % 10) / 10)},${fade * tw})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k * 0.4), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
