import type { Gray, Mask } from '../types';

function percentile(values: Uint8ClampedArray, p: number): number {
  const hist = new Uint32Array(256);
  for (const v of values) hist[v]++;
  const target = p * values.length;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

/**
 * Real-shadow mask. Without `expected`, a global threshold at `ratio` x the
 * 90th-percentile brightness (the lit wall).
 */
export function shadowMask(frame: Gray, expected: Gray | null, ratio = 0.45): Mask {
  const { width, height, data } = frame;
  const out: Mask = { width, height, data: new Uint8Array(width * height) };
  if (!expected) {
    const thr = ratio * percentile(data, 0.9);
    for (let i = 0; i < data.length; i++) out.data[i] = data[i] < thr ? 1 : 0;
    return out;
  }
  throw new Error('expected-brightness mode not implemented yet');
}
