import type { Mask, Pt } from '../types';
import type { PenState } from './pen';

const INK = 8;

/** The laser cue and the line being drawn (on the stage, and in the "what we project" mask). */
export function drawPen(ctx: CanvasRenderingContext2D, pen: PenState): void {
  if (pen.mode === 'idle' || !pen.cursor) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  if (pen.stroke.length > 1) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pen.stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  const { x, y } = pen.cursor;
  if (pen.mode === 'arming') {
    // a ring that fills up while you hold your finger
    ctx.strokeStyle = '#e0282b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + pen.arm * Math.PI * 2);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, 'rgba(255,40,40,1)');
    g.addColorStop(0.35, 'rgba(255,40,40,0.9)');
    g.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function strokeOn(ctx: OffscreenCanvasRenderingContext2D, pts: Pt[], map: (p: Pt) => Pt, width: number) {
  const a = pts[0], z = pts[pts.length - 1];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => { const q = map(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  if (Math.hypot(a.x - z.x, a.y - z.y) < size * 0.25) { ctx.closePath(); ctx.fill(); }
  ctx.stroke();
}

/** The drawing as a square 512 px picture (black on white) for recognition. */
export async function doodleToPng(pts: Pt[]): Promise<Blob> {
  const S = 512, c = new OffscreenCanvas(S, S), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), size = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  const k = (S * 0.8) / size, ox = (S - (Math.max(...xs) - x0) * k) / 2, oy = (S - (Math.max(...ys) - y0) * k) / 2;
  strokeOn(ctx, pts, (p) => ({ x: ox + (p.x - x0) * k, y: oy + (p.y - y0) * k }), 12);
  return c.convertToBlob({ type: 'image/png' });
}

/** The drawing as a mask (projector px, cropped to its box) — for melting it into an animal. */
export function doodleMask(pts: Pt[]): { mask: Mask; box: { x: number; y: number; w: number; h: number } } {
  const pad = INK;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs) - pad), y0 = Math.floor(Math.min(...ys) - pad);
  const w = Math.ceil(Math.max(...xs) + pad) - x0, h = Math.ceil(Math.max(...ys) + pad) - y0;
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true })!;
  strokeOn(ctx, pts, (p) => ({ x: p.x - x0, y: p.y - y0 }), INK);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3] > 128 ? 1 : 0;
  return { mask: { width: w, height: h, data }, box: { x: x0, y: y0, w, h } };
}
