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
  // Exposure gain: median of frame/expected over lit, unshadowed pixels.
  const ratios: number[] = [];
  const step = Math.max(1, Math.floor(data.length / 4000));
  for (let i = 0; i < data.length; i += step) {
    const e = expected.data[i];
    if (e < MIN_LIT) continue;
    ratios.push(data[i] / e);
  }
  ratios.sort((a, b) => a - b);
  // Most of the wall is unshadowed: take the median of the upper part to skip big shadows.
  const upper = ratios.slice(Math.floor(ratios.length * 0.3));
  const gain = upper.length ? upper[Math.floor(upper.length / 2)] : 1;
  for (let i = 0; i < data.length; i++) {
    const e = expected.data[i];
    out.data[i] = e >= MIN_LIT && data[i] < ratio * gain * e ? 1 : 0;
  }
  return out;
}

const MIN_LIT = 40;

/** What the camera should see: the white reference, except where we project black. */
export function buildExpected(whiteRef: Gray, projectedDarkCam: Mask): Gray {
  const data = new Uint8ClampedArray(whiteRef.data);
  for (let i = 0; i < data.length; i++) if (projectedDarkCam.data[i]) data[i] = 0;
  return { width: whiteRef.width, height: whiteRef.height, data };
}
