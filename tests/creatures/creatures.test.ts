import { describe, expect, it } from 'vitest';
import { createCreature } from '../../src/creatures';
import type { Spawn } from '../../src/creatures/types';

const kinds = ['dog', 'rabbit', 'butterfly', 'swan', 'heart'] as const;
const spawn: Spawn = {
  anchorBox: { x: 700, y: 400, w: 160, h: 120 },
  facing: 'right', openSide: 'right', wall: { w: 1920, h: 1080 }, avoid: { x: 0, y: 300, w: 500, h: 780 },
};

describe.each(kinds)('%s', (kind) => {
  it('head aligns with anchor at t=0', () => {
    const c = createCreature(kind, spawn);
    const head = c.headBoxWorld();
    const a = spawn.anchorBox;
    expect(Math.abs(head.x + head.w / 2 - (a.x + a.w / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(head.y + head.h / 2 - (a.y + a.h / 2))).toBeLessThanOrEqual(2);
    expect(Math.abs(Math.max(head.w, head.h) - Math.max(a.w, a.h))).toBeLessThanOrEqual(2);
  });

  it('stays finite', () => {
    const c = createCreature(kind, spawn);
    for (let i = 0; i < 300; i++) {
      c.update(33);
      const h = c.headBoxWorld();
      expect([h.x, h.y, h.w, h.h].every(Number.isFinite)).toBe(true);
    }
  });

  it('stays on the wall, exploring (never leaves by itself)', () => {
    const c = createCreature(kind, spawn);
    for (let t = 0; t < 60000; t += 33) c.update(33);
    expect(c.done).toBe(false);
    const h = c.headBoxWorld();
    expect(h.x + h.w / 2).toBeGreaterThan(-h.w);
    expect(h.x + h.w / 2).toBeLessThan(1920 + h.w);
    expect(h.y + h.h / 2).toBeGreaterThan(-h.h);
    expect(h.y + h.h / 2).toBeLessThan(1080 + h.h);
  });

  it('retire() fades it out, then it is done', () => {
    const c = createCreature(kind, spawn);
    for (let t = 0; t < 3000; t += 33) c.update(33);
    c.retire();
    for (let t = 0; t < 2500; t += 33) c.update(33);
    expect(c.done).toBe(true);
  });

  it('darkens pixels while on the wall', () => {
    const c = createCreature(kind, spawn);
    const m = c.darkMask(1920, 1080);
    expect(m.data.reduce((s, v) => s + v, 0)).toBeGreaterThan(1000);
  });
});




