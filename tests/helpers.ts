import type { Gray, Mask } from '../src/types';

export function gray(w: number, h: number, fill = 0): Gray {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h).fill(fill) };
}
export function mask(w: number, h: number): Mask {
  return { width: w, height: h, data: new Uint8Array(w * h) };
}
export function fillRect<T extends Gray | Mask>(img: T, x: number, y: number, w: number, h: number, v: number): T {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i >= 0 && j >= 0 && i < img.width && j < img.height) img.data[j * img.width + i] = v;
  }
  return img;
}
export function count(m: Mask): number {
  let n = 0;
  for (const v of m.data) n += v;
  return n;
}
export function bbox(m: Mask) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.data[y * m.width + x]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
