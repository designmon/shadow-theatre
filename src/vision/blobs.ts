import type { Box, Mask, Side } from '../types';

export type Blob = { area: number; box: Box; pixels: Int32Array; touches: Record<Side, number> };

/** 4-connected components of a mask, sorted by area (largest first). */
export function findBlobs(mask: Mask, minArea = 150): Blob[] {
  const { width: W, height: Hh, data } = mask;
  const seen = new Uint8Array(W * Hh);
  const stack = new Int32Array(W * Hh);
  const blobs: Blob[] = [];
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || seen[start]) continue;
    let sp = 0, n = 0;
    const px: number[] = [];
    stack[sp++] = start;
    seen[start] = 1;
    let x0 = W, y0 = Hh, x1 = -1, y1 = -1;
    const touches = { left: 0, right: 0, up: 0, down: 0 };
    while (sp) {
      const i = stack[--sp];
      px.push(i);
      n++;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x === 0) touches.left++; if (x === W - 1) touches.right++;
      if (y === 0) touches.up++; if (y === Hh - 1) touches.down++;
      if (x > 0 && data[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < W - 1 && data[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (y > 0 && data[i - W] && !seen[i - W]) { seen[i - W] = 1; stack[sp++] = i - W; }
      if (y < Hh - 1 && data[i + W] && !seen[i + W]) { seen[i + W] = 1; stack[sp++] = i + W; }
    }
    if (n >= minArea) blobs.push({ area: n, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, pixels: Int32Array.from(px), touches });
  }
  return blobs.sort((a, b) => b.area - a.area);
}
