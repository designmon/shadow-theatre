import { describe, expect, it } from 'vitest';
import { findBlobs } from '../../src/vision/blobs';
import { fillRect, mask } from '../helpers';

describe('findBlobs', () => {
  it('separates two squares', () => {
    const m = fillRect(fillRect(mask(100, 100), 10, 10, 20, 20, 1), 60, 50, 15, 15, 1);
    const blobs = findBlobs(m, 10);
    expect(blobs.map((b) => b.area)).toEqual([400, 225]);
    expect(blobs[0].box).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    expect(blobs[0].touches).toEqual({ left: 0, right: 0, up: 0, down: 0 });
  });

  it('drops specks below minArea', () => {
    const m = fillRect(fillRect(mask(100, 100), 10, 10, 20, 20, 1), 60, 50, 3, 3, 1);
    expect(findBlobs(m, 150)).toHaveLength(1);
  });

  it('counts border pixels per side', () => {
    const m = fillRect(mask(100, 100), 0, 40, 30, 10, 1);
    expect(findBlobs(m, 10)[0].touches.left).toBe(10);
  });
});
