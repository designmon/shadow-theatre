import { describe, expect, it } from 'vitest';
import { Doodle, MOTIONS, motionFor } from '../../src/draw/doodle';
import type { Pt } from '../../src/types';

const wall = { w: 1920, h: 1080 };
const loop = (cx = 900, cy = 500, rx = 120, ry = 50): Pt[] => Array.from({ length: 60 }, (_, i) => {
  const a = (i / 59) * Math.PI * 2;
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
});
const centre = (pts: Pt[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const run = (d: Doodle, ms: number) => { for (let t = 0; t < ms; t += 33) d.update(33); };

describe('Doodle', () => {
  it('starts as drawn and settles into the refined line', () => {
    const wobbly = loop().map((p, i) => ({ x: p.x + ((i * 7919) % 9) - 4, y: p.y + ((i * 104729) % 9) - 4 }));
    const d = new Doodle([wobbly], wall);
    const first = d.points().flat();
    run(d, 900);
    const settled = d.points().flat();
    const rough = (pts: Pt[]) => pts.slice(1, -1).reduce((s, p, i) => s + Math.hypot(pts[i + 2].x - 2 * p.x + pts[i].x, pts[i + 2].y - 2 * p.y + pts[i].y), 0);
    expect(rough(settled)).toBeLessThan(rough(first) / 2);
  });

  it('keeps several strokes (a face: outline + two eyes)', () => {
    const d = new Doodle([loop(900, 500, 100, 100), loop(870, 480, 8, 8), loop(930, 480, 8, 8)], wall);
    expect(d.points().length).toBe(3);
  });

  for (const motion of MOTIONS) {
    it(`${motion}: performs near where it was drawn`, () => {
      const d = new Doodle([loop()], wall);
      d.comeAlive(motion, 'thing');
      const p0 = d.points().flat().map((p) => ({ ...p }));
      run(d, 1500);
      const p1 = d.points().flat();
      expect(p1.some((p, i) => Math.hypot(p.x - p0[i].x, p.y - p0[i].y) > 2)).toBe(true);
      let far = 0;
      for (let t = 0; t < 4000; t += 99) { run(d, 99); const c = centre(d.points().flat()); far = Math.max(far, Math.hypot(c.x - 900, c.y - 500)); }
      expect(far).toBeLessThan(240 * 1.6);
    });
  }

  it('after performing it parks in its slot, smaller, and stays', () => {
    const d = new Doodle([loop()], wall);
    d.comeAlive('walk', 'cat');
    d.park({ x: 150, y: 1000 }, 0.4);
    run(d, 12000);
    const c = centre(d.points().flat());
    expect(Math.hypot(c.x - 150, c.y - 1000)).toBeLessThan(40);
    const xs = d.points().flat().map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(240 * 0.6);
    expect(d.parked).toBe(true);
    expect(d.done).toBe(false);
  });

  it('pointing at a parked one wakes it: it comes back up, performs, and returns', () => {
    const d = new Doodle([loop()], wall);
    d.comeAlive('beat', 'heart');
    d.park({ x: 150, y: 1000 }, 0.4);
    run(d, 12000);
    expect(d.hit({ x: 150, y: 1000 })).toBe(true);
    d.wake();
    run(d, 2500);
    expect(d.parked).toBe(false);
    expect(Math.hypot(centre(d.points().flat()).x - 150, centre(d.points().flat()).y - 1000)).toBeGreaterThan(200);
    run(d, 12000);
    expect(d.parked).toBe(true);
  });

  it('a heart is gently beautified toward an ideal heart', () => {
    // a lopsided heart-ish loop
    const raw = Array.from({ length: 80 }, (_, i) => {
      const t = (i / 79) * Math.PI * 2;
      return { x: 900 + 16 * Math.sin(t) ** 3 * 7 + (i % 5) * 2, y: 500 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 7 * (t > Math.PI ? 1.2 : 1) };
    });
    const d = new Doodle([raw], wall);
    run(d, 800);
    const before = d.points()[0];
    d.comeAlive('beat', 'heart');
    run(d, 700);
    const after = d.points()[0];
    const asym = (pts: Pt[]) => { const xs = pts.map((p) => p.x); const c = (Math.max(...xs) + Math.min(...xs)) / 2; return Math.abs(pts.reduce((s, p) => s + (p.x - c), 0) / pts.length); };
    expect(asym(after)).toBeLessThan(asym(before) + 0.5);
  });

  it('motionFor picks the motion that fits the thing', () => {
    expect(motionFor('heart', 'float')).toBe('beat');
    expect(motionFor('cat', 'fly')).toBe('walk');
    expect(motionFor('dog', 'float')).toBe('walk');
    expect(motionFor('bird', 'walk')).toBe('fly');
    expect(motionFor('fish', 'walk')).toBe('swim');
    expect(motionFor('star', 'float')).toBe('twinkle');
    expect(motionFor('something', 'hop')).toBe('hop');
  });

  it('retire() fades it out', () => {
    const d = new Doodle([loop()], wall);
    d.retire();
    run(d, 2000);
    expect(d.done).toBe(true);
  });
});
