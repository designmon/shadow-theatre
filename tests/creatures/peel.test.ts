import { describe, expect, it } from 'vitest';
import { PeelOff } from '../../src/creatures/peel';
import type { Spawn } from '../../src/creatures/types';
import { bbox, count, fillRect, mask } from '../helpers';

const anchorBox = { x: 800, y: 400, w: 120, h: 90 };
const spawn: Spawn = { anchorBox, facing: 'right', openSide: 'right', wall: { w: 1920, h: 1080 }, avoid: { x: 0, y: 300, w: 700, h: 780 } };
const shape = () => ({ mask: fillRect(mask(120, 90), 0, 0, 120, 90, 1), box: anchorBox });
const run = (p: PeelOff, ms: number) => { for (let t = 0; t < ms; t += 20) p.update(20); };
const intersects = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('PeelOff', () => {
  it('peel starts aligned', () => {
    const p = new PeelOff(shape(), spawn);
    expect(bbox(p.darkMask(1920, 1080))).toEqual(anchorBox);
  });

  it('peel never overlaps the source shadow after slide', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 600);
    const b = bbox(p.darkMask(1920, 1080));
    expect(intersects(b, anchorBox)).toBe(false);
    expect(b.x).toBeGreaterThan(anchorBox.x); // moved toward the open side (right)
  });

  it('unresolved peel finishes as unknown', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 6100);
    expect(p.kind).toBe('unknown');
    expect(p.done).toBe(true);
    expect(count(p.darkMask(1920, 1080))).toBe(0);
  });

  it('resolve(unknown) drifts away early', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 600);
    p.resolve({ kind: 'unknown', confidence: 0, facing: 'right', anchor: { x: 0.5, y: 0.5 } });
    run(p, 2100);
    expect(p.done).toBe(true);
  });
});
