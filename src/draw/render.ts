import type { Mask, Pt } from '../types';
import type { PenState } from './pen';

const INK = 8;

/**
 * Only the black ink can be mistaken for a shadow (the glow and sparkles are bright gold).
 * Leaves out the last stretch next to the fingertip: the finger's own shadow is there, and
 * hiding it would cut the finger short.
 */
export function drawInkMask(ctx: CanvasRenderingContext2D, pen: PenState, clearRadius = 45): void {
  if (pen.mode !== 'drawing' || !pen.cursor || pen.stroke.length < 2) return;
  const { x, y } = pen.cursor;
  const pts = pen.stroke.filter((p) => Math.hypot(p.x - x, p.y - y) > clearRadius);
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  curve(ctx, pts);
  ctx.stroke();
  ctx.restore();
}

/** Smooth curve through points (quadratic through midpoints). */
function curve(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const z = pts[pts.length - 1];
  ctx.lineTo(z.x, z.y);
}

/** The pen tip and the line being drawn: ink that blooms in gold behind a glowing tip. */
export function drawPen(ctx: CanvasRenderingContext2D, pen: PenState, tMs = performance.now()): void {
  if (pen.mode === 'idle' || !pen.cursor) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = pen.stroke;
  if (pts.length > 1) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = INK;
    curve(ctx, pts);
    ctx.stroke();
    // the freshest ink still glows gold for a moment
    const fresh = pts.slice(-14);
    for (let i = 1; i < fresh.length; i++) {
      const k = i / fresh.length;
      ctx.strokeStyle = `rgba(255,200,80,${0.85 * k})`;
      ctx.lineWidth = INK * (1.1 + 0.6 * k);
      ctx.beginPath(); ctx.moveTo(fresh[i - 1].x, fresh[i - 1].y); ctx.lineTo(fresh[i].x, fresh[i].y); ctx.stroke();
    }
  }
  const { x, y } = pen.cursor;
  const pulse = 1 + 0.12 * Math.sin(tMs / 120);
  if (pen.mode === 'arming') {
    // a golden ring gathers while you hold still
    ctx.strokeStyle = 'rgba(255,190,70,0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + pen.arm * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,200,90,${0.25 + 0.5 * pen.arm})`;
    ctx.beginPath(); ctx.arc(x, y, 6 + 6 * pen.arm, 0, Math.PI * 2); ctx.fill();
  } else {
    // a glowing pen tip: warm halo, bright core
    const r = 26 * pulse;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,235,1)');
    g.addColorStop(0.25, 'rgba(255,214,110,0.95)');
    g.addColorStop(0.6, 'rgba(255,170,60,0.35)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
