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

describe('PeelOff resolving into a creature', () => {
  it('resolve(dog) morphs then runs', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 600);
    p.resolve({ kind: 'dog', confidence: 0.9, facing: 'right', anchor: { x: 0.75, y: 0.4 } });
    // anchor point in projector px, after the slide (box moved right by w + 8)
    const ax = Math.round(anchorBox.x + 128 + 0.75 * anchorBox.w), ay = Math.round(anchorBox.y + 0.4 * anchorBox.h);
    p.update(20);
    expect(p.darkMask(1920, 1080).data[ay * 1920 + ax]).toBe(1); // creature head is where the hand's head was
    run(p, 500);
    expect(p.kind).toBe('dog');
    expect(p.done).toBe(false);
  });

  it('resolving before the slide ends waits for the slide', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 200);
    p.resolve({ kind: 'butterfly', confidence: 0.9, facing: 'up', anchor: { x: 0.5, y: 0.5 } });
    run(p, 400);
    const b = bbox(p.darkMask(1920, 1080));
    expect(intersects(b, anchorBox)).toBe(false);
  });

  it('creature eventually leaves the wall', () => {
    const p = new PeelOff(shape(), spawn);
    run(p, 600);
    p.resolve({ kind: 'rabbit', confidence: 0.9, facing: 'right', anchor: { x: 0.5, y: 0.3 } });
    run(p, 15000);
    expect(p.done).toBe(true);
  });
});

describe('PeelOff near the open edge', () => {
  it('slides at most half the remaining room', () => {
    const box = { x: 1650, y: 400, w: 120, h: 90 };
    const p = new PeelOff({ mask: fillRect(mask(120, 90), 0, 0, 120, 90, 1), box }, { ...spawn, anchorBox: box });
    run(p, 600);
    const b = bbox(p.darkMask(1920, 1080));
    expect(b.x + b.w).toBeLessThanOrEqual(1920);
    expect(b.x - box.x).toBeLessThanOrEqual(Math.ceil((1920 - (box.x + box.w)) / 2));
  });
});

describe('creature size from the hand', () => {
  it('sizes the creature head from the hand thickness, not the arm length', () => {
    // a long arm + hand silhouette reaching right: 400 wide, 90 tall
    const box = { x: 300, y: 400, w: 400, h: 90 };
    const p = new PeelOff({ mask: fillRect(mask(400, 90), 0, 0, 400, 90, 1), box }, { ...spawn, anchorBox: box });
    run(p, 600);
    p.resolve({ kind: 'dog', confidence: 0.9, facing: 'right', anchor: { x: 0.9, y: 0.5 } });
    run(p, 600);
    const head = (p as any).creature.headBoxWorld();
    expect(Math.max(head.w, head.h)).toBeLessThanOrEqual(100);
  });
});
