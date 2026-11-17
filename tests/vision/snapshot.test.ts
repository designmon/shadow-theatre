import { describe, expect, it } from 'vitest';
import { SNAPSHOT_PX, snapshotRegion } from '../../src/vision/snapshot';

describe('snapshot sent for recognition (Jev: every side 256..1568 px, total >= 78,400 px)', () => {
  it('is a square image big enough for Jev', () => {
    expect(SNAPSHOT_PX).toBeGreaterThanOrEqual(256);
    expect(SNAPSHOT_PX).toBeLessThanOrEqual(1568);
    expect(SNAPSHOT_PX * SNAPSHOT_PX).toBeGreaterThanOrEqual(78400);
  });

  it('crops a square region centred on a tall thin shape (like the two-finger rabbit)', () => {
    const r = snapshotRegion({ x: 100, y: 50, w: 20, h: 60 }, 12);
    expect(r.w).toBe(r.h);
    expect(r.w).toBe(60 + 24);
    expect(r.x + r.w / 2).toBeCloseTo(110);
    expect(r.y + r.h / 2).toBeCloseTo(80);
  });

  it('crops a square region for a wide shape too', () => {
    const r = snapshotRegion({ x: 10, y: 10, w: 80, h: 30 }, 12);
    expect(r).toEqual({ x: -2, y: -27, w: 104, h: 104 }); // centre (50, 25), side 80 + 24
  });
});
