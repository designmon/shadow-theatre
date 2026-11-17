import { describe, expect, it } from 'vitest';
import { minPool2 } from '../../src/camera';

describe('minPool2 (real-room report: fingers never turn red)', () => {
  it('keeps a 1-pixel-wide dark finger at full darkness when halving the picture', () => {
    const W = 64, H = 48, src = new Uint8ClampedArray(W * H).fill(200);
    for (let y = 10; y < 30; y++) src[y * W + 21] = 40; // a finger, 1 px wide at full resolution
    const out = minPool2(src, W, H);
    expect(out.width).toBe(32);
    expect(out.data[10 * 32 + 10]).toBe(40); // rows 20-21, on the finger: still dark (averaging would give ~160)
    expect(out.data[10 * 32 + 20]).toBe(200);
  });
});
