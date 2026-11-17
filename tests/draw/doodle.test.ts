import { describe, expect, it } from 'vitest';
import { Doodle, MOTIONS } from '../../src/draw/doodle';

// a little drawn fish-ish loop
const stroke = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 59) * Math.PI * 2;
  return { x: 900 + Math.cos(a) * 120, y: 500 + Math.sin(a) * 50 };
});
const wall = { w: 1920, h: 1080 };
const centre = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

describe('Doodle (a drawing that comes alive)', () => {
  it('starts exactly as drawn, before it knows how to move', () => {
    const d = new Doodle(stroke, wall);
    expect(d.points()[0]).toEqual(stroke[0]);
  });

  for (const motion of MOTIONS) {
    it(`${motion}: moves its own lines, and stays on the wall`, () => {
      const d = new Doodle(stroke, wall);
      d.comeAlive(motion);
      const p0 = d.points().map((p) => ({ ...p }));
      for (let t = 0; t < 700; t += 33) d.update(33);
      const p1 = d.points();
      const moved = p1.some((p, i) => Math.hypot(p.x - p0[i].x, p.y - p0[i].y) > 2);
      expect(moved).toBe(true);
      for (let t = 0; t < 60000; t += 33) d.update(33);
      const c = centre(d.points());
      expect(c.x).toBeGreaterThan(0); expect(c.x).toBeLessThan(wall.w);
      expect(c.y).toBeGreaterThan(0); expect(c.y).toBeLessThan(wall.h);
      expect(d.done).toBe(false);
    });
  }

  it('a swaying flower stays where it was drawn', () => {
    const d = new Doodle(stroke, wall);
    d.comeAlive('sway');
    for (let t = 0; t < 20000; t += 33) d.update(33);
    const c = centre(d.points());
    expect(Math.hypot(c.x - 900, c.y - 500)).toBeLessThan(60);
  });

  it('retire() fades it out', () => {
    const d = new Doodle(stroke, wall);
    d.retire();
    for (let t = 0; t < 2000; t += 33) d.update(33);
    expect(d.done).toBe(true);
  });
});
