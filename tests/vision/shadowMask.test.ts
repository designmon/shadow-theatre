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

import { buildExpected } from '../../src/vision/shadowMask';
import { mask } from '../helpers';
import type { Gray } from '../../src/types';

function gradient(): Gray {
  const g = gray(320, 240);
  for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) g.data[y * 320 + x] = 120 + Math.round((120 * x) / 319);
  return g;
}
function withShadow(ref: Gray, scale = 1): Gray {
  const f = { width: ref.width, height: ref.height, data: new Uint8ClampedArray(ref.data) };
  for (let y = 100; y < 150; y++) for (let x = 200; x < 260; x++) f.data[y * 320 + x] = Math.round(ref.data[y * 320 + x] * 0.15);
  for (let i = 0; i < f.data.length; i++) f.data[i] = Math.round(f.data[i] * scale);
  return f;
}

describe('shadowMask with expected wall', () => {
  it('detects shadow on non-uniform wall', () => {
    const ref = gradient();
    const m = shadowMask(withShadow(ref), buildExpected(ref, mask(320, 240)));
    expect(Math.abs(count(m) - 3000)).toBeLessThanOrEqual(60);
    expect(bbox(m)).toEqual({ x: 200, y: 100, w: 60, h: 50 });
  });

  it('normalizes exposure gain', () => {
    const ref = gradient();
    const m = shadowMask(withShadow(ref, 0.6), buildExpected(ref, mask(320, 240)));
    expect(bbox(m)).toEqual({ x: 200, y: 100, w: 60, h: 50 });
    expect(Math.abs(count(m) - 3000)).toBeLessThanOrEqual(60);
  });

  it('ignores pixels we project dark', () => {
    const ref = gradient();
    const f = fillRect(withShadow(ref), 20, 20, 40, 40, 5); // our own black creature
    const projectedDark = fillRect(mask(320, 240), 18, 18, 44, 44, 1);
    const m = shadowMask(f, buildExpected(ref, projectedDark));
    expect(bbox(m)).toEqual({ x: 200, y: 100, w: 60, h: 50 });
  });
});

import { litMask } from '../../src/vision/shadowMask';
describe('litMask', () => {
  it('marks the projected wall area', () => {
    const ref = fillRect(gray(320, 240, 10), 30, 20, 260, 200, 180);
    expect(bbox(litMask(ref))).toEqual({ x: 30, y: 20, w: 260, h: 200 });
  });
});
