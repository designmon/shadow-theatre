import { describe, expect, it } from 'vitest';
import { alignmentScore } from '../../src/calibration/alignment';
import { fillRect, gray, mask } from '../helpers';

const ref = gray(320, 240, 200);
const dark = fillRect(mask(320, 240), 100, 80, 60, 50, 1);

describe('alignmentScore', () => {
  it('alignment score high when aligned', () => {
    const frame = fillRect(gray(320, 240, 190), 100, 80, 60, 50, 15);
    expect(alignmentScore(frame, ref, dark)).toBeGreaterThan(0.9);
  });

  it('alignment score drops when shifted', () => {
    const frame = fillRect(gray(320, 240, 190), 125, 105, 60, 50, 15);
    expect(alignmentScore(frame, ref, dark)).toBeLessThan(0.5);
  });

  it('is 1 when nothing is projected dark', () => {
    expect(alignmentScore(gray(320, 240, 190), ref, mask(320, 240))).toBe(1);
  });
});
