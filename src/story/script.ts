import type { Doodle } from '../draw/doodle';
import type { Box, Pt } from '../types';

/** A little script for the drawings, from a voice command (server/command.ts). */
export type Step =
  | { do: 'goto'; who: string; near?: string; place?: string; above?: boolean; ms?: number }
  | { do: 'ride'; who: string; on: string }
  | { do: 'unride'; who: string }
  | { do: 'leave'; who: string; side: 'left' | 'right' | 'up' | 'down' }
  | { do: 'home'; who: string }
  | { do: 'say'; who: string; text: string }
  | { do: 'trick'; who: string; kind: 'jump' | 'spin' | 'shake' | 'grow' | 'rain' }
  | { do: 'wait'; ms: number }
  | { do: 'draw'; what: string; place?: string; near?: string };
export type Plan = { story: string; steps: Step[]; note?: string };

const TRICK_MS = { jump: 750, spin: 900, shake: 700, grow: 900, rain: 2600 };

/** Plays a plan, one step after another. Call update() every frame. */
export class ScriptRunner {
  private steps: Step[] = [];
  private nextAt = 0;
  private cast = new Map<string, Doodle>();
  private actors = new Set<Doodle>();
  private endAt: number | null = null;
  private waiting = false;
  /** Draw something new (the AI finger); resolves with the new drawing. */
  onDraw: ((what: string, at: Pt) => Promise<Doodle | null>) | null = null;

  constructor(private readonly wall: () => { w: number; h: number }, private readonly area: () => Box, private readonly now: () => number) {}

  get busy(): boolean { return this.waiting || this.steps.length > 0 || (this.endAt !== null && this.now() < this.endAt); }

  play(plan: Plan, doodles: Doodle[]): void {
    this.cast = new Map(doodles.filter((d) => d.id).map((d) => [d.id, d]));
    this.steps = [...plan.steps];
    this.waiting = false; // a new command doesn't wait for an outline nobody traced
    this.nextAt = this.now();
    this.endAt = null;
    this.actors.clear();
  }

  update(): void {
    const now = this.now();
    while (!this.waiting && this.steps.length && now >= this.nextAt) {
      const s = this.steps.shift()!;
      this.nextAt = now + this.run(s);
    }
    // when the scene is over, everyone stays where the story left them (those who left the wall
    // come back by themselves); a short quiet moment before the drawings' own little scenes resume
    if (!this.waiting && !this.steps.length && this.actors.size && this.endAt === null) { this.endAt = now + 4000; this.actors.clear(); }
    if (this.endAt !== null && now >= this.endAt) this.endAt = null;
  }

  /** Where to draw something new for a place word. */
  private placeFor(name: string): Pt {
    const { w, h } = this.wall(), A = this.area();
    if (name === 'sky' || name === 'top') return { x: w * 0.33, y: h * 0.25 };
    if (name === 'ground' || name === 'bottom') return { x: w * 0.33, y: h * 0.62 };
    if (name === 'water') return { x: A.x + A.w / 2, y: A.y + A.h * 0.85 };
    if (name === 'left') return { x: w * 0.2, y: h * 0.45 };
    if (name === 'right') return { x: w * 0.5, y: h * 0.45 };
    return { x: w * 0.33, y: h * 0.45 };
  }

  /** Where a place on the wall is. */
  private place(name: string, d: Doodle): Pt {
    const { w, h } = this.wall(), A = this.area(), b = d.box();
    const r = () => 0.25 + Math.random() * 0.5;
    switch (name) {
      case 'sky': return { x: A.x + A.w * r(), y: A.y + A.h * 0.12 };
      case 'ground': return { x: A.x + A.w * r(), y: A.y + A.h * 0.92 - b.h / 2 };
      case 'water': return { x: A.x + A.w * r(), y: A.y + A.h * 0.9 - b.h * 0.3 };
      case 'left': return { x: w * 0.2, y: d.where.y };
      case 'right': return { x: w * 0.85, y: d.where.y };
      case 'top': return { x: d.where.x, y: h * 0.15 };
      case 'bottom': return { x: d.where.x, y: h * 0.85 };
      default: return { x: w * 0.5, y: h * 0.5 };
    }
  }

  /** Do one step; returns how long until the next one (ms). */
  private run(s: Step): number {
    if (s.do === 'wait') return s.ms;
    if (s.do === 'draw') {
      if (!this.onDraw) return 0;
      const { w, h } = this.wall();
      const near = s.near ? this.cast.get(s.near) : null;
      const at = near ? { x: near.where.x - near.box().w - 160, y: near.where.y } : s.place && s.place !== 'center' ? this.placeFor(s.place) : { x: w * 0.33, y: h * 0.45 };
      this.waiting = true;
      void this.onDraw(s.what, at).then((d) => { if (d) this.cast.set('new', d); }).finally(() => { this.waiting = false; this.nextAt = this.now() + 400; });
      return 0;
    }
    const d = this.cast.get(s.who);
    if (!d) return 0;
    this.actors.add(d);
    switch (s.do) {
      case 'goto': {
        let to: Pt;
        const t = s.near ? this.cast.get(s.near) : null;
        if (t) {
          const b = t.box(), c = t.where, me = d.where;
          to = s.above ? { x: c.x, y: b.y - d.box().h * 0.6 } : { x: c.x + (Math.sign(me.x - c.x) || -1) * (b.w / 2 + d.box().w / 2 + 6), y: c.y + (b.h - d.box().h) / 2 };
        } else to = this.place(s.place ?? 'center', d);
        const ms = s.ms ?? 1600;
        d.goTo(to, ms);
        return ms + 150;
      }
      case 'ride': { const v = this.cast.get(s.on); if (v) { this.actors.add(v); d.ride(v); } return 400; }
      case 'unride': d.unride(); return 300;
      case 'leave': {
        const { w, h } = this.wall(), c = d.where, b = d.box();
        const to = s.side === 'left' ? { x: -b.w * 2, y: c.y } : s.side === 'up' ? { x: c.x, y: -b.h * 2 } : s.side === 'down' ? { x: c.x, y: h + b.h * 2 } : { x: w + b.w * 2, y: c.y };
        d.leave(to, 2600);
        return 2600;
      }
      case 'home': d.goHome(); return 700;
      case 'say': d.say(s.text, 2800); return 1100;
      case 'trick': d.trick(s.kind); return TRICK_MS[s.kind] + 100;
    }
  }
}
