import type { Doodle, Trick } from '../draw/doodle';
import type { Pt } from '../types';

/**
 * Little stories between the drawings. Every so often the director picks a scene that fits who is
 * on the wall (the bird visits the flower, the dog greets the cat, a cloud rains on the flower)
 * and a short line for the story tells it.
 */

const SAYS: Record<string, string[]> = {
  dog: ['Woof!', 'Woof woof!'], cat: ['Meow.', 'Purr…'], bird: ['♪ tweet ♪', '♪ ♪'], butterfly: ['flutter flutter'], fish: ['blub', 'blub blub'],
  rabbit: ['hop hop!'], flower: ['Mmm, sunshine.'], tree: ['rustle…'], sun: ['Good morning!'], moon: ['Shh… night time.'], star: ['twinkle ✦'],
  heart: ['♥'], cloud: ['drip drop'], house: ['Welcome home.'], car: ['Beep beep!'], boat: ['Ahoy!'], plane: ['Whoosh!'],
  person: ['Hello!'], face: [':)'], snake: ['Sss…'], turtle: ['Slow and steady.'], circle: ['Boing!'], something: ['Hello!'],
};
const TRICK: Record<string, Trick> = {
  dog: 'jump', cat: 'shake', bird: 'spin', butterfly: 'spin', fish: 'jump', rabbit: 'jump', flower: 'grow', tree: 'shake', sun: 'grow',
  moon: 'shake', star: 'spin', heart: 'grow', cloud: 'rain', house: 'shake', car: 'shake', boat: 'shake', plane: 'spin', person: 'jump',
  face: 'grow', snake: 'shake', turtle: 'shake', circle: 'jump', something: 'jump',
};
const FLYERS = ['bird', 'butterfly'], PERCHES = ['flower', 'tree', 'house'];
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const name = (d: Doodle) => (d.what && d.what !== 'something' ? d.what : 'doodle');
const plural = (w: string) => (/(fish|sheep)$/.test(w) ? w : /(s|sh|ch)$/.test(w) ? w + 'es' : /y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
const line = (d: Doodle) => pick(SAYS[d.what] ?? SAYS.something);

type Beat = { weight: number; run: () => string /* the caption */ };

export class Director {
  caption: { text: string; at: number } | null = null;
  private queue: { at: number; fn: () => void }[] = [];
  private nextAt = 0;
  private last = '';

  constructor(private readonly cast: () => Doodle[], private readonly now: () => number) {}

  private later(ms: number, fn: () => void) { this.queue.push({ at: this.now() + ms, fn }); }
  private tell(text: string) { this.caption = { text, at: this.now() }; }

  /** Call every frame. */
  update(paused: boolean): void {
    const now = this.now();
    for (const q of this.queue.splice(0)) (q.at <= now ? q.fn() : this.queue.push(q));
    if (paused || now < this.nextAt) return;
    this.nextAt = now + 10000 + Math.random() * 6000;
    const beats = this.beats();
    if (!beats.length) return;
    const total = beats.reduce((a, b) => a + b.weight, 0);
    let r = Math.random() * total;
    const beat = beats.find((b) => (r -= b.weight) < 0) ?? beats[0];
    const text = beat.run();
    if (text) { this.tell(text); this.last = text; }
  }

  /** Something happened just now (a new drawing arrived): start a scene soon. */
  nudge(ms = 2500): void { this.nextAt = Math.min(this.nextAt, this.now() + ms); }

  /** Next to someone (ground), or just above them (flyers, clouds). */
  private beside(target: Doodle, above = false, from?: Doodle): Pt {
    const b = target.box(), c = target.where;
    const side = from ? Math.sign(from.where.x - c.x) || -1 : -1;
    return above ? { x: c.x, y: b.y - b.h * 0.35 } : { x: c.x + side * b.w * 0.8, y: c.y };
  }

  private beats(): Beat[] {
    const all = this.cast().filter((d) => d.resting && d.what);
    const of = (...labels: string[]) => all.filter((d) => labels.includes(d.what));
    const B: Beat[] = [];
    const flyer = of(...FLYERS), perch = of(...PERCHES), dog = of('dog'), cat = of('cat'), fish = of('fish'), rabbit = of('rabbit');
    const flower = of('flower', 'tree'), cloud = of('cloud'), sun = of('sun'), moon = of('moon'), heart = of('heart');
    const boat = of('boat'), person = of('person'), house = of('house'), car = of('car'), plane = of('plane');
    if (flyer.length && perch.length) B.push({ weight: 3, run: () => {
      const a = pick(flyer), b = pick(perch);
      a.visit(this.beside(b, true), 3200); this.later(1900, () => { a.say(pick(['♪', 'What a lovely ' + b.what + '!', 'Hello, ' + b.what + '!'])); });
      this.later(3000, () => b.trick('grow'));
      return `The ${name(a)} visits the ${name(b)}.`;
    } });
    if (dog.length && cat.length) B.push({ weight: 3, run: () => {
      const a = pick(dog), b = pick(cat);
      a.visit(this.beside(b, false, a), 3000); this.later(1800, () => { a.say('Woof! Play with me?'); a.trick('jump'); });
      this.later(3000, () => { b.say('Hiss!'); b.trick('shake'); });
      return `The dog wants to play. The cat is not impressed.`;
    } });
    const prey = [...fish, ...of('bird')];
    if (cat.length && prey.length) B.push({ weight: 2, run: () => {
      const a = pick(cat), b = pick(prey);
      a.visit(this.beside(b, false, a), 2600); this.later(1800, () => a.say('Hmm… lunch?'));
      this.later(2600, () => { b.trick(b.what === 'fish' ? 'jump' : 'spin'); b.say('Eek!'); });
      return `The cat has its eye on the ${b.what}.`;
    } });
    if (rabbit.length && flower.length) B.push({ weight: 2, run: () => {
      const a = pick(rabbit), b = pick(flower);
      a.visit(this.beside(b, false, a), 3000); this.later(1800, () => { a.say('nom nom'); a.trick('jump'); });
      return `The rabbit nibbles the ${b.what}.`;
    } });
    if (cloud.length && flower.length) B.push({ weight: 3, run: () => {
      const a = pick(cloud), b = pick(flower);
      a.visit(this.beside(b, true), 3600); this.later(1800, () => a.trick('rain'));
      this.later(3800, () => { b.trick('grow'); b.say('Ahh, thank you!'); });
      return `It rains on the ${b.what}, and it grows.`;
    } });
    if (sun.length && all.length > 1) B.push({ weight: 2, run: () => {
      const s = pick(sun);
      s.trick('grow'); s.say('Good morning, everyone!');
      all.filter((d) => d !== s).forEach((d, i) => this.later(900 + i * 250, () => d.trick(TRICK[d.what] === 'rain' ? 'shake' : TRICK[d.what] ?? 'jump')));
      return 'The sun wakes everyone up.';
    } });
    if (moon.length && all.length > 1) B.push({ weight: 2, run: () => {
      const m = pick(moon);
      m.say('Good night…');
      all.filter((d) => d !== m).forEach((d, i) => this.later(1200 + i * 300, () => d.say('zzz', 2600)));
      return 'The moon says good night.';
    } });
    if (heart.length && all.length >= 3) B.push({ weight: 2, run: () => {
      const h = pick(heart), others = all.filter((d) => d !== h), a = pick(others), b = pick(others.filter((d) => d !== a));
      const mid = { x: (a.where.x + b.where.x) / 2, y: Math.min(a.box().y, b.box().y) - 40 };
      h.visit(mid, 3000);
      this.later(2000, () => { a.say('♥'); b.say('♥'); a.trick('jump'); b.trick('jump'); });
      return a.what === b.what ? `The two ${plural(name(a))} are friends.` : `The ${name(a)} and the ${name(b)} are friends.`;
    } });
    if (boat.length && fish.length) B.push({ weight: 2, run: () => {
      const a = pick(fish), b = pick(boat);
      a.visit(this.beside(b, false, a), 2400); this.later(1800, () => { a.trick('jump'); b.say('Ahoy, little fish!'); });
      return 'A fish jumps by the boat.';
    } });
    if (person.length && dog.length) B.push({ weight: 2, run: () => {
      const a = pick(person), b = pick(dog);
      a.visit(this.beside(b, false, a), 3000); this.later(1800, () => a.say('Good dog!')); this.later(2400, () => { b.trick('jump'); b.say('Woof!'); });
      return 'Someone pets the dog.';
    } });
    if (person.length && house.length) B.push({ weight: 1, run: () => {
      const a = pick(person), b = pick(house);
      a.visit(this.beside(b, false, a), 3000); this.later(1800, () => a.say('Home sweet home.'));
      return 'Time to go home.';
    } });
    for (const v of [...car, ...plane]) B.push({ weight: 1, run: () => {
      const b = v.box();
      v.visit({ x: v.where.x + (v.where.x > 1000 ? -1 : 1) * b.w * 2.2, y: v.where.y }, 1200); v.say(line(v));
      return v.what === 'car' ? 'The car goes for a drive.' : 'The plane swooshes across the sky.';
    } });
    if (all.length >= 2) B.push({ weight: 1, run: () => {
      const a = pick(all), b = pick(all.filter((d) => d !== a));
      a.visit(this.beside(b, FLYERS.includes(a.what) || a.what === 'cloud'), 2800);
      this.later(1800, () => a.say(a.what === b.what ? 'Hi, friend!' : `Hi, ${name(b)}!`)); this.later(2600, () => { b.say(line(b)); b.trick(TRICK[b.what] === 'rain' ? 'shake' : TRICK[b.what] ?? 'jump'); });
      return a.what === b.what ? `One ${name(a)} visits the other.` : `The ${name(a)} visits the ${name(b)}.`;
    } });
    if (all.length === 1) B.push({ weight: 1, run: () => {
      const a = all[0];
      a.trick(TRICK[a.what] ?? 'jump'); a.say(line(a));
      return '';
    } });
    return B.filter(() => true);
  }

}

/** For the caption: draw it under the composition, light and small. */
export function drawCaption(ctx: CanvasRenderingContext2D, c: { text: string; at: number } | null, x: number, y: number, ink: string, now: number): void {
  if (!c) return;
  const age = now - c.at, a = Math.min(1, age / 400) * Math.min(1, (5200 - age) / 700);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = ink;
  ctx.font = 'italic 300 19px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(c.text, x, y);
  ctx.restore();
}

/** The story so far, in the corner of the wall: the last few lines, the newest brightest. */
export class StoryLog {
  private lines: { text: string; at: number }[] = [];
  add(text: string, now: number): void {
    if (!text || this.lines[this.lines.length - 1]?.text === text) return;
    this.lines.push({ text, at: now });
    if (this.lines.length > 4) this.lines.shift();
  }
  get last(): string { return this.lines[this.lines.length - 1]?.text ?? ''; }
  draw(ctx: CanvasRenderingContext2D, wall: { w: number; h: number }, ink: string, now: number): void {
    if (!this.lines.length) return;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    const x = 28, maxW = wall.w * 0.5;
    let y = wall.h - 44;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i], newest = i === this.lines.length - 1;
      ctx.globalAlpha = (newest ? 0.9 : 0.35 - (this.lines.length - 2 - i) * 0.08) * Math.min(1, (now - l.at) / 600);
      ctx.font = `italic 300 ${newest ? 20 : 16}px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`;
      // wrap long lines
      const words = l.text.split(' '), rows: string[] = [];
      let row = '';
      for (const w of words) { const t = row ? row + ' ' + w : w; if (ctx.measureText(t).width > maxW && row) { rows.push(row); row = w; } else row = t; }
      rows.push(row);
      for (let r = rows.length - 1; r >= 0; r--) { ctx.fillText(rows[r], x, y); y -= newest ? 26 : 21; }
      y -= 6;
    }
    ctx.restore();
  }
}
