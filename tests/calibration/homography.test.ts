import { describe, expect, it } from 'vitest';
import { applyH, invertH, solveHomography, warpMask } from '../../src/calibration/homography';
import { bbox, fillRect, mask } from '../helpers';

const truth = [1.1, 0.05, 12, -0.03, 0.95, 7, 0.0004, -0.0002, 1];
const project = (p: { x: number; y: number }) => {
  const w = truth[6] * p.x + truth[7] * p.y + 1;
  return { x: (truth[0] * p.x + truth[1] * p.y + truth[2]) / w, y: (truth[3] * p.x + truth[4] * p.y + truth[5]) / w };
};

describe('homography', () => {
  it('identity maps points to themselves', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
    const h = solveHomography(pts, pts);
    const p = applyH(h, { x: 37, y: 21 });
    expect(p.x).toBeCloseTo(37, 6);
    expect(p.y).toBeCloseTo(21, 6);
  });

  it('recovers a known perspective', () => {
    const src = [{ x: 10, y: 10 }, { x: 300, y: 20 }, { x: 290, y: 220 }, { x: 15, y: 230 }];
    const h = solveHomography(src, src.map(project));
    const q = { x: 150, y: 120 };
    const got = applyH(h, q), want = project(q);
    expect(Math.abs(got.x - want.x)).toBeLessThan(0.01);
    expect(Math.abs(got.y - want.y)).toBeLessThan(0.01);
  });

  it('invertH round-trips', () => {
    const inv = invertH(truth);
    const p = applyH(inv, applyH(truth, { x: 55, y: 66 }));
    expect(p.x).toBeCloseTo(55, 6);
    expect(p.y).toBeCloseTo(66, 6);
  });

  it('warpMask translates', () => {
    const m = fillRect(mask(50, 50), 10, 10, 10, 10, 1);
    // h maps OUTPUT px -> INPUT px: output x reads input x-5, i.e. shift right by 5
    const out = warpMask(m, [1, 0, -5, 0, 1, 0, 0, 0, 1], 50, 50);
    expect(bbox(out)).toEqual({ x: 15, y: 10, w: 10, h: 10 });
  });
});
