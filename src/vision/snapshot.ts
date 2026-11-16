import type { Box, Mask } from '../types';

/** Black silhouette on white, cropped to box + pad, long side scaled to 256 px. */
export async function maskToPng(mask: Mask, box: Box, pad = 12): Promise<Blob> {
  const x0 = Math.max(0, box.x - pad), y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(mask.width, box.x + box.w + pad), y1 = Math.min(mask.height, box.y + box.h + pad);
  const w = x1 - x0, h = y1 - y0;
  const src = new OffscreenCanvas(w, h);
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = mask.data[(y + y0) * mask.width + (x + x0)] ? 0 : 255;
    const o = (y * w + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  src.getContext('2d')!.putImageData(img, 0, 0);
  const s = 256 / Math.max(w, h);
  const out = new OffscreenCanvas(Math.round(w * s), Math.round(h * s));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out.convertToBlob({ type: 'image/png' });
}
