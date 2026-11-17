import { describe, expect, it } from 'vitest';
import { buildLight, litFrame } from '../../src/vision/light';
import { shadowMask } from '../../src/vision/shadowMask';
import type { RGB } from '../../src/camera';

// One row of camera pixels in a warm lamp-lit room, like the real wall (white ~170 / black ~129):
// the lamps already push red near the top, the projector adds mostly green and blue.
const n = 50;
const rgb = (f: (i: number) => [number, number, number]): RGB => {
  const r = new Uint8ClampedArray(n), g = new Uint8ClampedArray(n), b = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) [r[i], g[i], b[i]] = f(i);
  return { r: { width: n, height: 1, data: r }, g: { width: n, height: 1, data: g }, b: { width: n, height: 1, data: b } };
};
const noise = (i: number) => ((i * 7919) % 7) - 3;
const off: [number, number, number] = [232, 118, 60]; // projector black: lamp light only
const on: [number, number, number] = [250, 172, 132]; // projector white
const light = buildLight(rgb(() => off), rgb(() => on));

describe('light: per-channel "lit by the projector"', () => {
  it('ignores the red channel the lamps already flood', () => {
    expect(light.inv[0]).toBe(0); // red: only +18
    expect(light.inv[1]).toBeGreaterThan(0);
    expect(light.inv[2]).toBeGreaterThan(0);
  });

  it('the white wall reads lit (with noise), a shadow reads dark', () => {
    const lit = litFrame(rgb((i) => (i < 25 ? [on[0] + noise(i), on[1] + noise(i), on[2] + noise(i)] : [off[0] + noise(i), off[1] + noise(i), off[2] + noise(i)])), light);
    expect(Math.min(...lit.data.slice(0, 25))).toBeGreaterThan(200);
    expect(Math.max(...lit.data.slice(25))).toBeLessThan(40);
  });

  it('our blue ink reads as lit wall, black ink as dark', () => {
    // projected blue (35,70,255): the projector sends ~no red, a little green, full blue
    const blue: [number, number, number] = [off[0], off[1] + 0.15 * (on[1] - off[1]), on[2]];
    const lit = litFrame(rgb((i) => (i < 25 ? blue : off)), light);
    const mask = shadowMask(lit, light.white, 0.45, light.black);
    expect(mask.data.slice(0, 25).every((v) => v === 0)).toBe(true); // blue ink: not a shadow
    expect(mask.data.slice(25).every((v) => v === 1)).toBe(true); // black: dark
  });
});
