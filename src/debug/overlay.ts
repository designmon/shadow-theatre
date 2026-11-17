import type { Gray, Mask } from '../types';

let img: ImageData | null = null;
let tmp: OffscreenCanvas | null = null;

/** Picture-in-picture of the camera (gray) with the shadow mask in red, top-left, 25% wide. */
export function drawDebug(
  ctx: CanvasRenderingContext2D,
  info: { frame: Gray; mask: Mask; fps: number; lines?: string[]; puppetBox?: { x: number; y: number; w: number; h: number } | null },
): void {
  const { frame, mask } = info;
  if (!img || img.width !== frame.width || img.height !== frame.height) {
    img = new ImageData(frame.width, frame.height);
    tmp = new OffscreenCanvas(frame.width, frame.height);
  }
  const d = img.data;
  for (let i = 0, j = 0; j < frame.data.length; i += 4, j++) {
    const v = frame.data[j];
    if (mask.data[j]) { d[i] = 255; d[i + 1] = v >> 2; d[i + 2] = v >> 2; }
    else { d[i] = v; d[i + 1] = v; d[i + 2] = v; }
    d[i + 3] = 255;
  }
  tmp!.getContext('2d')!.putImageData(img, 0, 0);
  const w = ctx.canvas.width * 0.18;
  const h = (w * frame.height) / frame.width;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.drawImage(tmp!, 16, 16, w, h);
  ctx.strokeStyle = '#f00';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, w, h);
  if (info.puppetBox) {
    // the part of the shadow it treats as the puppet (what gets sent to Claude)
    const s = w / frame.width, b = info.puppetBox;
    ctx.strokeStyle = '#0a0';
    ctx.lineWidth = 3;
    ctx.strokeRect(16 + b.x * s, 16 + b.y * s, b.w * s, b.h * s);
  }
  ctx.fillStyle = '#c00';
  ctx.font = `${Math.round(14 * devicePixelRatio)}px system-ui, sans-serif`;
  const lines = [`${info.fps.toFixed(0)} fps`, ...(info.lines ?? [])];
  lines.forEach((l, i) => ctx.fillText(l, 16, 16 + h + 20 * devicePixelRatio * (i + 1)));
  ctx.restore();
}
