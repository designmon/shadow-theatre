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

/**
 * Where the projector actually lights the wall, in camera space. With a `dark`
 * frame (projector showing black), uses how much the projector *adds* to each
 * pixel, so spill light / boosted exposure around the wall doesn't count.
 */
export function litMask(whiteRef: Gray, dark?: Gray, min = MIN_LIT): Mask {
  const n = whiteRef.data.length;
  const data = new Uint8Array(n);
  if (!dark) {
    for (let i = 0; i < n; i++) data[i] = whiteRef.data[i] >= min ? 1 : 0;
    return { width: whiteRef.width, height: whiteRef.height, data };
  }
  const diff = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) diff[i] = whiteRef.data[i] - dark.data[i];
  const thr = Math.max(15, 0.25 * percentile(diff, 0.95));
  for (let i = 0; i < n; i++) data[i] = diff[i] >= thr ? 1 : 0;
  return { width: whiteRef.width, height: whiteRef.height, data };
}

/** Shrink a mask by r pixels. */
export function erode(m: Mask, r: number): Mask {
  const inv: Mask = { width: m.width, height: m.height, data: m.data.map((v) => 1 - v) };
  const grown = dilate(inv, r);
  return { width: m.width, height: m.height, data: grown.data.map((v) => 1 - v) };
}

/** Grow a mask by r pixels (square neighbourhood, separable). */
export function dilate(m: Mask, r: number): Mask {
  const { width: W, height: H } = m;
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && !v; k++) v = m.data[y * W + k];
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && !v; k++) v = tmp[k * W + x];
    out[y * W + x] = v;
  }
  return { width: W, height: H, data: out };
}

/** Only keep mask pixels inside `region` (e.g. shadows only on the projected picture). */
export function keepInside(m: Mask, region: Mask): Mask {
  const data = new Uint8Array(m.data.length);
  for (let i = 0; i < data.length; i++) data[i] = m.data[i] & region.data[i];
  return { width: m.width, height: m.height, data };
}
