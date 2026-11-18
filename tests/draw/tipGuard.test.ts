import { describe, expect, it } from 'vitest';
import { TipGuard } from '../../src/draw/tipGuard';

describe('TipGuard: the pen stays on the real fingertip', () => {
  it('a finger that reads shorter for a few frames (faint tip) does not pull the pen back', () => {
    const g = new TipGuard(), palm = { x: 500, y: 500 };
    let minX = Infinity;
    for (let i = 0; i < 40; i++) {
      const short = i % 7 === 3 || i % 7 === 4; // the tip's shadow fades now and then
      const tip = g.feed({ x: palm.x + (short ? 150 : 200), y: 500 }, palm, i * 33)!;
      if (i > 2) minX = Math.min(minX, tip.x);
    }
    expect(minX).toBeGreaterThan(695); // never slid back from 700
  });
  it('really curling the finger is followed after a moment', () => {
    const g = new TipGuard(), palm = { x: 500, y: 500 };
    for (let i = 0; i < 10; i++) g.feed({ x: 700, y: 500 }, palm, i * 33);
    let tip = { x: 0, y: 0 };
    for (let i = 10; i < 30; i++) tip = g.feed({ x: 660, y: 500 }, palm, i * 33)!;
    expect(tip.x).toBe(660);
  });
  it('a one-frame hop to another part of the hand is not believed; a real move of the hand is', () => {
    const g = new TipGuard();
    for (let i = 0; i < 10; i++) g.feed({ x: 700, y: 500 }, { x: 500, y: 500 }, i * 33);
    expect(g.feed({ x: 540, y: 640 }, { x: 500, y: 500 }, 330)).toBeNull(); // the "tip" on the thumb
    expect(g.feed({ x: 702, y: 500 }, { x: 500, y: 500 }, 363)).toEqual({ x: 702, y: 500 }); // back on the finger
    // the whole hand moving fast: tip and palm together — fine
    expect(g.feed({ x: 802, y: 560 }, { x: 600, y: 560 }, 396)).toEqual({ x: 802, y: 560 });
  });
  it('a new place that holds steady is accepted', () => {
    const g = new TipGuard(), palm = { x: 500, y: 500 };
    for (let i = 0; i < 10; i++) g.feed({ x: 700, y: 500 }, palm, i * 33);
    const out = [];
    for (let i = 10; i < 18; i++) out.push(g.feed({ x: 520, y: 690 }, palm, i * 33));
    expect(out[0]).toBeNull();
    expect(out[out.length - 1]).toEqual({ x: 520, y: 690 });
  });
});
