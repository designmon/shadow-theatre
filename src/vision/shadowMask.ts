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
export function shadowMask(frame: Gray, expected: Gray | null, ratio = 0.45, black?: Gray): Mask {
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
    if (e < MIN_LIT) continue;
    if (black) {
      // A shadow is where the projector's light is missing: closer to the "projector off" level
      // than to the white wall. Works in a room that isn't fully dark (white 180 / black 136).
      // 2 = firm shadow, 1 = soft (fingers further from the wall): kept only if connected to firm.
      const b = black.data[i];
      if (e - b < MIN_CONTRAST) continue;
      out.data[i] = data[i] < gain * (b + SPLIT * (e - b)) ? 2 : data[i] < gain * (b + SOFT_SPLIT * (e - b)) ? 1 : 0;
    } else {
      out.data[i] = data[i] < ratio * gain * e ? 1 : 0;
    }
  }
  if (black) growSoft(out);
  return out;
}

/** Keep soft shadow pixels (1) only where they connect to firm shadow (2); result is 0/1. */
function growSoft(m: Mask): void {
  const { width: W, height: H, data } = m;
  const stack: number[] = [];
  for (let i = 0; i < data.length; i++) if (data[i] === 2) stack.push(i);
  while (stack.length) {
    const i = stack.pop()!, x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j >= 0 && j < W * H && data[j] === 1) { data[j] = 2; stack.push(j); }
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = data[i] === 2 ? 1 : 0;
}

const SOFT_SPLIT = 0.75; // soft shadow: a quarter of the way down from the white wall
const SPLIT = 0.5; // halfway between "projector off" and "projector on"
const MIN_CONTRAST = 12; // the projector must brighten a pixel at least this much to judge it

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

/**
 * Smooth a blocky outline (a small camera mask enlarged onto the big wall):
 * blur with a box of radius r (two passes ≈ soft round kernel), then cut at half.
 */
export function smoothMask(m: Mask, r: number): Mask {
  const { width: W, height: H } = m;
  if (r < 1) return m;
  let a: Float32Array = Float32Array.from(m.data);
  const blur = (src: Float32Array) => {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[y * W + x] = s / k;
        s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = s / k;
        s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
  };
  a = blur(blur(a));
  const data = new Uint8Array(W * H);
  for (let i = 0; i < data.length; i++) data[i] = a[i] >= 0.5 ? 1 : 0;
  return { width: W, height: H, data };
}

/** The wall minus a margin along its edges: the border between picture and bare wall is no shadow. */
export function wallInterior(lit: Mask, margin = 3): Mask {
  return erode(lit, margin);
}
