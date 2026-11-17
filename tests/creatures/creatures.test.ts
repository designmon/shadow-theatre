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

  it('eventually done', () => {
    const c = createCreature(kind, spawn);
    let t = 0;
    while (!c.done && t < 15000) { c.update(33); t += 33; }
    expect(c.done).toBe(true);
  });

  it('darkens pixels while on the wall', () => {
    const c = createCreature(kind, spawn);
    const m = c.darkMask(1920, 1080);
    expect(m.data.reduce((s, v) => s + v, 0)).toBeGreaterThan(1000);
  });
});

describe('stage presence', () => {
  it('a creature stays on the wall at least 3.5 s even near the edge', () => {
    for (const kind of kinds) {
      const c = createCreature(kind, { ...spawn, anchorBox: { x: 1300, y: 400, w: 100, h: 80 } });
      let t = 0;
      while (!c.done && t < 20000) { c.update(33); t += 33; }
      expect(t).toBeGreaterThanOrEqual(3500);
    }
  });
});
