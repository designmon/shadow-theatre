import { describe, expect, it } from 'vitest';
import { createCreature } from '../../src/creatures';
import type { Spawn } from '../../src/creatures/types';

const spawn: Spawn = { anchorBox: { x: 900, y: 500, w: 120, h: 100 }, facing: 'right', openSide: 'right', wall: { w: 1920, h: 1080 }, avoid: null };
const center = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

describe('shy creatures', () => {
  it('veers away from nearby hand', () => {
    const run = (shy: boolean) => {
      const c = createCreature('rabbit', { ...spawn }, 1);
      for (let t = 0; t < 1600; t += 20) c.update(20); // finish the intro + grace
      const hb = c.headBoxWorld();
      const hand = { x: hb.x + hb.w + 10, y: hb.y - 60, w: 80, h: 80 }; // just above-right of the head
      if (shy) { c.avoid({ ...hand, x: hand.x + 40 }); c.avoid(hand); } // the hand comes closer
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

describe('review M3 (re-graded): no shove at birth, bounded shove', () => {
  it('does not flee during the intro or right after', () => {
    const c = createCreature('dog', spawn, 1);
    c.avoid({ x: 1000, y: 470, w: 80, h: 80 });
    expect((c as any).flee).toBeNull();
  });
  it('only flees from a hand that moves toward it, and not too far', () => {
    const c = createCreature('rabbit', spawn, 1);
    for (let t = 0; t < 2500; t += 20) c.update(20);
    const head = c.headBoxWorld();
    const near = (dx: number) => ({ x: head.x + head.w + dx, y: head.y, w: 80, h: 80 });
    c.avoid(near(60)); // first sighting: just remembered
    expect((c as any).flee).toBeNull();
    c.avoid(near(20)); // it came closer: flee
    expect((c as any).flee).not.toBeNull();
    for (let i = 0; i < 20; i++) { for (let t = 0; t < 800; t += 20) c.update(20); (c as any).flee = { dir: { x: -1, y: 0 }, until: (c as any).t + 800 }; }
    const shove = (c as any).shove;
    expect(Math.hypot(shove.x, shove.y)).toBeLessThanOrEqual(1.5 * Math.max(head.w, head.h) + 1);
  });
});
