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
  it('starts exactly as drawn, then settles into the refined line', () => {
    const wobbly = stroke.map((p, i) => ({ x: p.x + ((i * 7919) % 9) - 4, y: p.y + ((i * 104729) % 9) - 4 }));
    const d = new Doodle(wobbly, wall);
    const first = d.points();
    expect(Math.hypot(first[0].x - wobbly[0].x, first[0].y - wobbly[0].y)).toBeLessThan(6);
    for (let t = 0; t < 900; t += 33) d.update(33);
    const settled = d.points();
    let rough0 = 0, rough1 = 0;
    for (let i = 1; i < first.length - 1; i++) {
      rough0 += Math.hypot(first[i + 1].x - 2 * first[i].x + first[i - 1].x, first[i + 1].y - 2 * first[i].y + first[i - 1].y);
      rough1 += Math.hypot(settled[i + 1].x - 2 * settled[i].x + settled[i - 1].x, settled[i + 1].y - 2 * settled[i].y + settled[i - 1].y);
    }
    expect(rough1).toBeLessThan(rough0 / 2);
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
      let far = 0;
      for (let t = 0; t < 60000; t += 33) {
        d.update(33);
        if (t % 990 === 0) { const c = centre(d.points()); far = Math.max(far, Math.hypot(c.x - 900, c.y - 500)); }
      }
      expect(far).toBeLessThan(240 * 1.6); // stays near where it was drawn (drawing is 240 px wide)
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
