import { describe, expect, it } from 'vitest';
import { planPath } from '../../src/creatures/path';
import type { Spawn } from '../../src/creatures/types';
import type { Side } from '../../src/types';

const wall = { w: 1920, h: 1080 };
const dirs: Record<Side, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const spawnFor = (openSide: Side): Spawn => {
  const anchorBox = { x: 900, y: 480, w: 160, h: 120 };
  const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' }[openSide] as Side;
  const [dx, dy] = dirs[opposite];
  return {
    anchorBox, facing: openSide, openSide, wall,
    avoid: { x: 900 + dx * 600, y: 480 + dy * 400, w: 200, h: 200 },
  };
};

describe('planPath', () => {
  it('path starts at anchor center', () => {
    const p = planPath(spawnFor('right'), 1);
    expect(p[0]).toEqual({ x: 980, y: 540 });
  });

  for (const side of ['left', 'right', 'up', 'down'] as Side[]) {
    it(`first move is toward open side (${side})`, () => {
      const s = spawnFor(side);
      const p = planPath(s, 3);
      const [dx, dy] = dirs[side];
      const along = (p[1].x - p[0].x) * dx + (p[1].y - p[0].y) * dy;
      expect(along).toBeGreaterThanOrEqual(s.anchorBox.w);
    });
  }

  it('path never enters avoid box', () => {
    for (const side of ['left', 'right', 'up', 'down'] as Side[]) {
      const s = spawnFor(side);
      const a = s.avoid!;
      for (let seed = 0; seed < 50; seed++) {
        const p = planPath(s, seed);
        for (let i = 1; i < p.length; i++) {
          for (let t = 0; t <= 1; t += 0.05) {
            const x = p[i - 1].x + (p[i].x - p[i - 1].x) * t, y = p[i - 1].y + (p[i].y - p[i - 1].y) * t;
            const inside = x > a.x - 10 && x < a.x + a.w + 10 && y > a.y - 10 && y < a.y + a.h + 10;
            expect(inside).toBe(false);
          }
        }
      }
    }
  });

  it('path ends off-wall', () => {
    for (const side of ['left', 'right', 'up', 'down'] as Side[]) {
      const end = planPath(spawnFor(side), 7).at(-1)!;
      const off = end.x < 0 || end.x > wall.w || end.y < 0 || end.y > wall.h;
      expect(off).toBe(true);
    }
  });
});

describe('planPath with little room ahead', () => {
  it('turns along the wall when the open side is short', () => {
    const s: Spawn = { anchorBox: { x: 1620, y: 300, w: 160, h: 120 }, facing: 'right', openSide: 'right', wall, avoid: { x: 1000, y: 200, w: 300, h: 880 } };
    const p = planPath(s, 5);
    const end = p.at(-1)!;
    expect(end.y < 0 || end.y > wall.h).toBe(true); // leaves through the top or bottom
    for (const q of p) expect(q.x).toBeLessThanOrEqual(wall.w);
    // goes toward the roomier side (the anchor is in the upper half -> down)
    expect(end.y).toBeGreaterThan(wall.h);
  });
});
