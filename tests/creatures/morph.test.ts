import { describe, expect, it } from 'vitest';
import { centroidOf, morphOutline, outlineOf } from '../../src/creatures/morph';
import { fillRect, mask } from '../helpers';

describe('outline morph (shadow melting into the animal)', () => {
  it('outlineOf traces how far the shape reaches in every direction from its centre', () => {
    const m = fillRect(mask(100, 100), 30, 40, 40, 20, 1); // 40 wide, 20 tall
    const c = centroidOf(m);
    expect(c.x).toBeCloseTo(49.5, 0);
    expect(c.y).toBeCloseTo(49.5, 0);
    const r = outlineOf(m, c, 8); // directions: 0 = right, 2 = down, 4 = left, 6 = up
    expect(Math.abs(r[0] - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(r[2] - 10)).toBeLessThanOrEqual(1);
    expect(Math.abs(r[4] - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(r[6] - 10)).toBeLessThanOrEqual(1);
  });

  it('starts exactly as the shadow and ends exactly as the animal', () => {
    const a = { c: { x: 10, y: 10 }, r: [5, 5, 5, 5] }, b = { c: { x: 50, y: 20 }, r: [9, 1, 9, 1] };
    const p0 = morphOutline(a, b, 0), p1 = morphOutline(a, b, 1);
    expect(p0[0]).toEqual({ x: 15, y: 10 });
    expect(p1[0]).toEqual({ x: 59, y: 20 });
    expect(p1[1].y).toBeCloseTo(21);
  });

  it('is in between half way', () => {
    const a = { c: { x: 0, y: 0 }, r: [10, 10, 10, 10] }, b = { c: { x: 0, y: 0 }, r: [30, 30, 30, 30] };
    const mid = morphOutline(a, b, 0.5);
    expect(Math.hypot(mid[0].x, mid[0].y)).toBeGreaterThan(10);
    expect(Math.hypot(mid[0].x, mid[0].y)).toBeLessThan(30);
  });
});
