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

import { fitForExport } from '../../src/runway/export';

describe('Doodle with a Runway clip', () => {
  const circle = Array.from({ length: 60 }, (_, i) => ({ x: 600 + Math.cos((i / 60) * Math.PI * 2) * 80, y: 300 + Math.sin((i / 60) * Math.PI * 2) * 80 }));
  const fakeClip = () => {
    const c = { started: 0, ended: false, remainingMs: 4000, drawn: 0, start() { this.started++; }, draw() { this.drawn++; } };
    return c;
  };
  it('gets an id from when it was drawn and what it is', () => {
    const d = new Doodle([circle], { w: 1280, h: 720 });
    d.comeAlive('beat', 'heart');
    expect(d.id).toMatch(/^\d{8}-\d{6}-heart$/);
  });
  it('the export fits the drawing in the middle of a 1280x720 image', () => {
    const fit = fitForExport([{ pts: [{ x: -50, y: -20 }, { x: 50, y: 20 }], closed: false, fill: false }]);
    expect(fit.cx).toBe(0);
    expect(fit.s).toBeCloseTo((1280 * 0.7) / 100);
  });
  it('wakes into its clip, then the still drawing, then back to its place', () => {
    const d = new Doodle([circle], { w: 1280, h: 720 });
    d.comeAlive('beat', 'heart');
    d.park({ x: 1200, y: 680 }, 0.4);
    d.runwayFit = fitForExport(d.restShape());
    const clip = fakeClip();
    d.attachClip(clip);
    for (let t = 0; t < 8000; t += 50) d.update(50); // performs, walks to its place
    expect(d.parked).toBe(true);
    d.wake();
    for (let t = 0; t < 1800; t += 50) d.update(50); // back up on stage
    d.update(50);
    expect(d.playingClip).toBe(true);
    expect(clip.started).toBe(1);
    clip.ended = true;
    d.update(50);
    expect(d.playingClip).toBe(false);
    for (let t = 0; t < 1600; t += 50) d.update(50);
    for (let t = 0; t < 1800; t += 50) d.update(50);
    expect(d.parked).toBe(true); // and rests again
  });
  it('without a clip it wakes into its built-in animation, as before', () => {
    const d = new Doodle([circle], { w: 1280, h: 720 });
    d.comeAlive('beat', 'heart');
    d.park({ x: 1200, y: 680 }, 0.4);
    for (let t = 0; t < 8000; t += 50) d.update(50);
    d.wake();
    for (let t = 0; t < 1900; t += 50) d.update(50);
    expect(d.playingClip).toBe(false);
  });
});

describe('Doodle: a clip that just arrived from Runway (phase 2)', () => {
  const circle = Array.from({ length: 60 }, (_, i) => ({ x: 600 + Math.cos((i / 60) * Math.PI * 2) * 80, y: 300 + Math.sin((i / 60) * Math.PI * 2) * 80 }));
  const clip = () => ({ started: 0, ended: false, remainingMs: 4000, start() { this.started++; }, draw() {} });
  it('resting: it comes back up and plays it by itself', () => {
    const d = new Doodle([circle], { w: 1280, h: 720 });
    d.comeAlive('fly', 'butterfly');
    d.park({ x: 1200, y: 680 }, 0.4);
    d.runwayFit = fitForExport(d.restShape());
    d.pending = true;
    for (let t = 0; t < 8000; t += 50) d.update(50);
    expect(d.parked).toBe(true);
    const c = clip();
    d.revealClip(c);
    expect(d.pending).toBe(false);
    for (let t = 0; t < 1900; t += 50) d.update(50);
    expect(d.playingClip).toBe(true);
    expect(c.started).toBe(1);
  });
  it('still performing: the clip takes over right there', () => {
    const d = new Doodle([circle], { w: 1280, h: 720 });
    d.comeAlive('fly', 'butterfly');
    d.runwayFit = fitForExport(d.restShape());
    for (let t = 0; t < 1000; t += 50) d.update(50);
    d.revealClip(clip());
    d.update(50);
    expect(d.playingClip).toBe(true);
  });
});
