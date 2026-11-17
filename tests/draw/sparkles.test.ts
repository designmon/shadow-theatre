import { describe, expect, it } from 'vitest';
import { Sparkles } from '../../src/draw/sparkles';

describe('Sparkles', () => {
  it('a burst sends out glints that drift and fade away', () => {
    const s = new Sparkles(1);
    s.burst({ x: 500, y: 300 }, 30);
    expect(s.count).toBe(30);
    for (let t = 0; t < 400; t += 16) s.update(16);
    expect(s.count).toBeGreaterThan(0);
    expect(s.spread()).toBeGreaterThan(20); // they move outwards
    for (let t = 0; t < 3000; t += 16) s.update(16);
    expect(s.count).toBe(0);
  });
  it('the trail emits more glints the faster the tip moves, none when still', () => {
    const still = new Sparkles(2), fast = new Sparkles(2);
    for (let i = 0; i < 30; i++) { still.trail({ x: 500, y: 300 }, 16); fast.trail({ x: 500 + i * 12, y: 300 }, 16); }
    expect(still.count).toBeLessThan(3);
    expect(fast.count).toBeGreaterThan(10);
  });
  it('never keeps more than a few hundred glints', () => {
    const s = new Sparkles(3);
    for (let i = 0; i < 50; i++) s.burst({ x: 1, y: 1 }, 40);
    expect(s.count).toBeLessThanOrEqual(400);
  });
});
