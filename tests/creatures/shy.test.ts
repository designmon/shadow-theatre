import { describe, expect, it } from 'vitest';
import { createCreature } from '../../src/creatures';
import type { Spawn } from '../../src/creatures/types';

const spawn: Spawn = { anchorBox: { x: 900, y: 500, w: 120, h: 100 }, facing: 'right', openSide: 'right', wall: { w: 1920, h: 1080 }, avoid: null };
const center = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

describe('shy creatures', () => {
  it('veers away from nearby hand', () => {
    const hand = { x: 1000, y: 380, w: 80, h: 80 }; // just above-right of the head
    const run = (shy: boolean) => {
      const c = createCreature('rabbit', { ...spawn }, 1);
      for (let t = 0; t < 1000; t += 20) c.update(20); // finish the intro
      if (shy) c.avoid(hand);
      for (let t = 0; t < 800; t += 20) c.update(20);
      const h = center(c.headBoxWorld()), k = center(hand);
      return Math.hypot(h.x - k.x, h.y - k.y);
    };
    expect(run(true)).toBeGreaterThan(run(false) + 40);
  });

  it('ignores a hand that is far away', () => {
    const c = createCreature('dog', spawn), d = createCreature('dog', spawn);
    // same seed-free path? compare by applying avoid with a far box: no displacement
    c.avoid({ x: 100, y: 100, w: 50, h: 50 });
    expect((c as any).flee).toBeNull();
    expect((d as any).flee).toBeNull();
  });
});
