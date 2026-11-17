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

import { dilate } from '../../src/vision/shadowMask';
describe('dilate', () => {
  it('grows a mask by r pixels', () => {
    const m = dilate(fillRect(mask(50, 50), 20, 20, 5, 5, 1), 2);
    expect(bbox(m)).toEqual({ x: 18, y: 18, w: 9, h: 9 });
  });
});

describe('review I4: lit wall from white minus dark', () => {
  it('spill-lit surroundings are not part of the wall', () => {
    const white = fillRect(gray(320, 240, 70), 30, 20, 260, 200, 200); // surround brightened by auto-exposure
    const dark = gray(320, 240, 62);
    expect(bbox(litMask(white, dark))).toEqual({ x: 30, y: 20, w: 260, h: 200 });
  });
});

import { erode } from '../../src/vision/shadowMask';
describe('erode', () => {
  it('shrinks a mask by r pixels', () => {
    expect(bbox(erode(fillRect(mask(50, 50), 10, 10, 20, 20, 1), 3))).toEqual({ x: 13, y: 13, w: 14, h: 14 });
  });
});

import { keepInside } from '../../src/vision/shadowMask';
describe('keepInside', () => {
  it('drops shadow pixels outside the projected picture (furniture, room)', () => {
    const m = fillRect(fillRect(mask(100, 100), 5, 5, 10, 10, 1), 50, 50, 10, 10, 1);
    const wall = fillRect(mask(100, 100), 40, 40, 40, 40, 1);
    expect(bbox(keepInside(m, wall))).toEqual({ x: 50, y: 50, w: 10, h: 10 });
  });
});

describe('room not fully dark (real-room report: white 180 / black 136)', () => {
  it('finds a soft shadow that is only a bit darker than the white wall', () => {
    const white = gray(320, 240, 180), black = gray(320, 240, 136);
    const frame = fillRect(gray(320, 240, 180), 100, 80, 60, 50, 140); // shadow = room light only
    const m = shadowMask(frame, buildExpected(white, mask(320, 240)), 0.45, black);
    expect(bbox(m)).toEqual({ x: 100, y: 80, w: 60, h: 50 });
  });
  it('ignores small brightness wobble on the white wall', () => {
    const white = gray(320, 240, 180), black = gray(320, 240, 136);
    const frame = fillRect(gray(320, 240, 180), 100, 80, 60, 50, 168);
    expect(count(shadowMask(frame, buildExpected(white, mask(320, 240)), 0.45, black))).toBe(0);
  });
  it('still copes with the camera darkening everything (auto-exposure)', () => {
    const white = gray(320, 240, 180), black = gray(320, 240, 136);
    const frame = gray(320, 240, 0);
    for (let i = 0; i < frame.data.length; i++) frame.data[i] = 180 * 0.7;
    fillRect(frame, 100, 80, 60, 50, Math.round(140 * 0.7));
    const m = shadowMask(frame, buildExpected(white, mask(320, 240)), 0.45, black);
    expect(bbox(m)).toEqual({ x: 100, y: 80, w: 60, h: 50 });
  });
});

import { smoothMask } from '../../src/vision/shadowMask';
describe('smoothMask (no blocky copies on the wall)', () => {
  // a diagonal edge enlarged 8x from a small camera picture: big stair steps
  const stairs = () => {
    const m = mask(80, 80);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (Math.floor(x / 8) <= Math.floor(y / 8)) m.data[y * 80 + x] = 1;
    return m;
  };
  const steps = (m: ReturnType<typeof mask>) => {
    // how many rows the edge stays on the same column = step height; smooth edges move every row or two
    let longest = 0, run = 0, prev = -1;
    for (let y = 10; y < 70; y++) {
      let edge = 0;
      for (let x = 0; x < 80; x++) if (m.data[y * 80 + x]) edge = x;
      run = edge === prev ? run + 1 : 1; prev = edge; longest = Math.max(longest, run);
    }
    return longest;
  };
  it('turns stair steps into a smooth edge', () => {
    expect(steps(stairs())).toBeGreaterThanOrEqual(8);
    expect(steps(smoothMask(stairs(), 5))).toBeLessThanOrEqual(3);
  });
  it('keeps the shape about the same size', () => {
    const before = count(stairs()), after = count(smoothMask(stairs(), 5));
    expect(Math.abs(after - before) / before).toBeLessThan(0.08);
  });
});

describe('soft finger shadows (real-room report: the dog loses its fingers)', () => {
  const white = gray(320, 240, 172), black = gray(320, 240, 131);
  it('includes lighter finger shadows that are connected to the darker palm shadow', () => {
    const f = fillRect(gray(320, 240, 172), 100, 100, 40, 30, 133); // palm: full shadow
    fillRect(f, 140, 108, 30, 6, 160); // fingers: soft, light shadow (above the half-way level)
    const m = shadowMask(f, buildExpected(white, mask(320, 240)), 0.45, black);
    expect(bbox(m)).toEqual({ x: 100, y: 100, w: 70, h: 30 });
  });
  it('ignores the same light grey when it is not connected to a real shadow', () => {
    const f = fillRect(gray(320, 240, 172), 200, 50, 30, 6, 160);
    expect(count(shadowMask(f, buildExpected(white, mask(320, 240)), 0.45, black))).toBe(0);
  });
});

describe('edge of the projected picture (real-room report: the border is taken for a shape)', () => {
  it('wallInterior keeps a margin away from the picture edge', async () => {
    const { wallInterior } = await import('../../src/vision/shadowMask');
    const lit = fillRect(mask(100, 100), 10, 10, 80, 60, 1);
    expect(bbox(wallInterior(lit, 3))).toEqual({ x: 13, y: 13, w: 74, h: 54 });
  });
});

import { bridgeOwnInk } from '../../src/vision/shadowMask';
describe('bridgeOwnInk (old drawings must not cut the hand apart)', () => {
  it('reconnects a hand shadow across an ink line we projected over it', () => {
    const hand = fillRect(mask(100, 100), 20, 40, 60, 20, 1);
    fillRect(hand, 48, 40, 4, 20, 0); // our ink line hides a 4 px strip of the hand
    const ink = fillRect(mask(100, 100), 48, 0, 4, 100, 1); // the line runs the whole height
    const m = bridgeOwnInk(hand, ink, 3);
    expect(m.data[50 * 100 + 50]).toBe(1); // bridged inside the hand
    expect(m.data[10 * 100 + 50]).toBe(0); // the line itself is not part of the hand
    expect(m.data[90 * 100 + 50]).toBe(0);
  });
});

import { ownInk } from '../../src/vision/shadowMask';

describe('shadowMask with what we project (lamp-lit room, ordinary brightness)', () => {
  // the user's room: projector off 136, white wall 180 (camera luma), noise of a few levels
  const W = 60, H = 40, n = W * H;
  const g = (f: (i: number) => number) => ({ width: W, height: H, data: Uint8ClampedArray.from({ length: n }, (_, i) => f(i)) });
  const black = g(() => 136), white = g(() => 180);
  const noise = (i: number) => ((i * 7919) % 7) - 3; // ±3 levels, deterministic
  const inkRow = (i: number) => Math.floor(i / W) >= 18 && Math.floor(i / W) < 21 && i % W >= 10 && i % W < 50; // a coloured line
  const projected = g((i) => (inkRow(i) ? 107 : 255)); // our blue/violet/pink line ≈ 42% as bright as white

  it('the plain wall is not a shadow, even with camera noise', () => {
    const frame = g((i) => 180 + noise(i));
    expect(shadowMask(frame, white, 0.45, black, projected).data.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('our coloured line is not a shadow, even when the room makes it look darker than predicted', () => {
    // a lit room flattens it: camera sees it only ~18% of the way from "off" to white
    const frame = g((i) => (inkRow(i) ? 136 + 0.18 * 44 : 180) + noise(i));
    expect(shadowMask(frame, white, 0.45, black, projected).data.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('a finger shadow on the white wall is found, and does not spread along our line', () => {
    const finger = (i: number) => Math.floor(i / W) >= 10 && Math.floor(i / W) < 30 && i % W >= 5 && i % W < 12;
    const frame = g((i) => (finger(i) ? 137 : inkRow(i) ? 136 + 0.18 * 44 : 180) + noise(i));
    const m = shadowMask(frame, white, 0.45, black, projected);
    expect(m.data[15 * W + 8]).toBe(1); // the finger
    expect(m.data[19 * W + 30]).toBe(0); // the line far from it
  });

  it('ownInk marks our line (where a hand may be cut)', () => {
    const ink = ownInk(projected);
    expect(ink.data[19 * W + 30]).toBe(1);
    expect(ink.data[5 * W + 30]).toBe(0);
  });
});
