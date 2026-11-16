import { describe, expect, it } from 'vitest';
import { HoldDetector, iou } from '../../src/vision/hold';
import { fillRect, mask } from '../helpers';

const sq = (x: number) => fillRect(mask(320, 240), x, 100, 40, 40, 1);

describe('iou', () => {
  it('iou of identical is 1, disjoint is 0', () => {
    expect(iou(sq(10), sq(10))).toBe(1);
    expect(iou(sq(10), sq(200))).toBe(0);
  });
});

describe('HoldDetector', () => {
  it('fires after 700 ms of stillness', () => {
    const d = new HoldDetector();
    const fired: number[] = [];
    for (let t = 0; t <= 800; t += 33) if (d.push(sq(100), t)) fired.push(t);
    expect(fired).toEqual([726]);
  });

  it('does not fire while moving', () => {
    const d = new HoldDetector();
    let any = false;
    for (let t = 0, x = 0; t <= 2000; t += 33, x += 8) any ||= d.push(sq(x % 260), t);
    expect(any).toBe(false);
  });

  it('fires once, then cooldown', () => {
    const d = new HoldDetector();
    const fired: number[] = [];
    for (let t = 0; t <= 3000; t += 33) if (d.push(sq(100), t)) fired.push(t);
    expect(fired).toEqual([726]); // keeps holding: no re-fire for the same hold
    // move away, then a new hold after cooldown fires again
    for (let t = 3033; t <= 3300; t += 33) d.push(sq(200), t + (t % 66 ? 0 : 0)) && fired.push(t);
    for (let t = 3333, i = 0; t <= 4500; t += 33, i++) if (d.push(sq(30), t)) fired.push(t);
    expect(fired.length).toBe(2);
  });

  it('respects cooldown after a fire', () => {
    const d = new HoldDetector({ cooldownMs: 1500 });
    const fired: number[] = [];
    for (let t = 0; t <= 800; t += 33) if (d.push(sq(100), t)) fired.push(t);
    for (let t = 833; t <= 1700; t += 33) if (d.push(sq(30), t)) fired.push(t); // new pose held 870 ms, but inside cooldown
    expect(fired).toEqual([726]);
  });
});

describe('HoldDetector after a fire', () => {
  it('does not re-fire for a slightly changed version of the same pose', () => {
    const d = new HoldDetector({ cooldownMs: 0 });
    const fired: number[] = [];
    for (let t = 0; t <= 800; t += 33) if (d.push(sq(100), t)) fired.push(t);
    // our own creature now covers part of the shadow: the mask shrinks (IoU vs original ~0.6)
    const partial = fillRect(mask(320, 240), 100, 100, 24, 40, 1);
    for (let t = 833; t <= 3000; t += 33) if (d.push(partial, t)) fired.push(t);
    expect(fired).toEqual([726]);
  });

  it('re-arms once the shape is clearly different', () => {
    const d = new HoldDetector({ cooldownMs: 0 });
    const fired: number[] = [];
    for (let t = 0; t <= 800; t += 33) if (d.push(sq(100), t)) fired.push(t);
    for (let t = 833; t <= 2000; t += 33) if (d.push(sq(220), t)) fired.push(t);
    expect(fired.length).toBe(2);
  });
});
