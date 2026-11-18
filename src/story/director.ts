import type { Doodle, Trick } from '../draw/doodle';
import type { Pt } from '../types';

/**
 * Little stories between the drawings. Every so often the director picks a scene that fits who is
 * on the wall (the bird visits the flower, the dog greets the cat, a cloud rains on the flower)
 * and a short caption tells it. Clicking a drawing (a quick fist over it) makes it ask you
 * something; your answer decides what happens next.
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

  /** Clicked (a quick fist over it): it asks you something; your answer decides what it does. */
  clicked(d: Doodle): void {
    const all = this.cast().filter((x) => x.what);
    const doTrick = (t: Trick, text: string) => { d.trick(t); d.say(text); };
    const ask = (q: string, options: string[], then: Record<string, () => void>) => d.say(q, 8000, options, (o) => then[o]?.());
    const nameD = name(d);
    switch (d.what) {
      case 'dog': return ask('Play with me?', ['Fetch!', 'Nap'], { 'Fetch!': () => { doTrick('jump', 'Got it!'); this.tell('The dog plays fetch.'); }, Nap: () => { d.say('zzz', 4000); this.tell('The dog takes a nap.'); } });
      case 'cat': return ask('Pet me?', ['Pet', 'Shoo'], { Pet: () => { doTrick('grow', 'Purrr…'); this.tell('The cat purrs.'); }, Shoo: () => { doTrick('shake', 'Hmph!'); this.tell('The cat is offended.'); } });
      case 'bird': return ask('Shall I sing?', ['Sing', 'Fly'], { Sing: () => { doTrick('spin', '♪ ♪ ♪'); this.tell('The bird sings.'); }, Fly: () => { const p = all.find((x) => PERCHES.includes(x.what)); if (p) d.visit(this.beside(p, true), 3000); else d.trick('spin'); this.tell('The bird flies off.'); } });
      case 'flower': case 'tree': return ask('Water me?', ['Water', 'Later'], { Water: () => { const c = all.find((x) => x.what === 'cloud' && x.resting); if (c) { c.visit(this.beside(d, true), 3600); this.later(1800, () => c.trick('rain')); this.later(3800, () => doTrick('grow', 'Thank you!')); } else doTrick('grow', 'Ahh, thank you!'); this.tell(`The ${nameD} gets some water.`); }, Later: () => d.say('…okay.') });
      case 'sun': case 'moon': return ask('Day or night?', ['Day', 'Night'], { Day: () => { all.forEach((x, i) => this.later(i * 200, () => x.trick(x === d ? 'grow' : 'jump'))); d.say('Good morning!'); this.tell('A new day begins.'); }, Night: () => { all.forEach((x, i) => this.later(i * 250, () => x.say('zzz', 3000))); this.tell('Everyone goes to sleep.'); } });
      case 'fish': return ask('Want to see a jump?', ['Yes!', 'Swim'], { 'Yes!': () => { doTrick('jump', 'Splash!'); this.tell('The fish jumps.'); }, Swim: () => doTrick('shake', 'blub blub') });
      case 'heart': return ask('Who do you love?', all.filter((x) => x !== d).slice(0, 2).map(name).concat(all.length < 2 ? ['Everyone'] : []), Object.fromEntries(all.filter((x) => x !== d).map((x) => [name(x), () => { d.visit({ x: x.where.x, y: x.box().y - 40 }, 3000); this.later(2000, () => x.say('♥')); this.tell(`Love for the ${name(x)}.`); }]).concat([['Everyone', () => doTrick('grow', '♥ ♥ ♥')]])));
      default: return ask('What should I do?', ['Dance', 'Sleep'], { Dance: () => { doTrick('spin', '♪'); this.later(900, () => d.trick('jump')); this.tell(`The ${nameD} dances.`); }, Sleep: () => { d.say('zzz', 4000); this.tell(`The ${nameD} sleeps.`); } });
    }
  }

  /** The recognition wasn't sure: the drawing asks you what it is. */
  askWhat(d: Doodle, options: string[], relabel: (what: string) => void): void {
    d.say(`Am I a ${options.slice(0, -1).join(', a ')} or a ${options[options.length - 1]}?`, 9000, options, (o) => { relabel(o); d.say(`A ${o}! Thank you.`); });
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
