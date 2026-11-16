import { describe, expect, it } from 'vitest';
import { shadowMask } from '../../src/vision/shadowMask';
import { bbox, count, fillRect, gray } from '../helpers';

describe('shadowMask without expected', () => {
  it('marks dark region as shadow without expected', () => {
    const f = fillRect(gray(320, 240, 200), 100, 80, 40, 40, 20);
    const m = shadowMask(f, null);
    expect(count(m)).toBe(1600);
    expect(bbox(m)).toEqual({ x: 100, y: 80, w: 40, h: 40 });
  });

  it('ignores mid-gray noise', () => {
    const f = fillRect(gray(320, 240, 200), 10, 10, 30, 30, 150);
    expect(count(shadowMask(f, null))).toBe(0);
  });
});
