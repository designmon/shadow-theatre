import type { Box, Mask } from '../types';

/** Square size of the image sent for recognition (Jev needs 256..1568 px per side). */
export const SNAPSHOT_PX = 512;

/** A square region (camera px) centred on `box`, side = longest side + 2 * pad. May reach past the frame. */
export function snapshotRegion(box: Box, pad = 12): Box {
  const side = Math.max(box.w, box.h) + 2 * pad;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}

/** Black silhouette on white, square SNAPSHOT_PX image of snapshotRegion(box, pad) (outside the frame = white). */
export async function maskToPng(mask: Mask, box: Box, pad = 12): Promise<Blob> {
  const r = snapshotRegion(box, pad);
  const side = Math.ceil(r.w);
  const src = new OffscreenCanvas(side, side);
  const img = new ImageData(side, side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(r.x + x), my = Math.floor(r.y + y);
    const on = mx >= 0 && my >= 0 && mx < mask.width && my < mask.height && mask.data[my * mask.width + mx];
    const o = (y * side + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = on ? 0 : 255;
    img.data[o + 3] = 255;
  }
  src.getContext('2d')!.putImageData(img, 0, 0);
  const out = new OffscreenCanvas(SNAPSHOT_PX, SNAPSHOT_PX);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SNAPSHOT_PX, SNAPSHOT_PX);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, SNAPSHOT_PX, SNAPSHOT_PX);
  return out.convertToBlob({ type: 'image/png' });
}
