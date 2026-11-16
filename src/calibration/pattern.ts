import type { Gray, Mask, Pt } from '../types';
import { findBlobs } from '../vision/blobs';

const INSET = 0.12;
const SIZE = 60;

/** Black screen with four white squares; returns their centers TL, TR, BR, BL (projector px). */
export function drawCalibrationPattern(ctx: CanvasRenderingContext2D, w: number, h: number): Pt[] {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const s = SIZE * Math.max(1, w / 1920);
  const centers = [
    { x: w * INSET, y: h * INSET }, { x: w * (1 - INSET), y: h * INSET },
    { x: w * (1 - INSET), y: h * (1 - INSET) }, { x: w * INSET, y: h * (1 - INSET) },
  ];
  ctx.fillStyle = '#fff';
  for (const c of centers) ctx.fillRect(c.x - s, c.y - s, 2 * s, 2 * s);
  return centers;
}

/** Locate the four squares in the camera (lit minus dark), ordered TL, TR, BR, BL. */
export function findMarkers(lit: Gray, dark: Gray): Pt[] | null {
  const { width: W, height: H } = lit;
  const diff = new Int16Array(W * H);
  let max = 0;
  for (let i = 0; i < diff.length; i++) { diff[i] = lit.data[i] - dark.data[i]; if (diff[i] > max) max = diff[i]; }
  if (max < 30) return null;
  const m: Mask = { width: W, height: H, data: new Uint8Array(W * H) };
  for (let i = 0; i < diff.length; i++) m.data[i] = diff[i] > max * 0.5 ? 1 : 0;
  const blobs = findBlobs(m, 8).slice(0, 4);
  if (blobs.length < 4) return null;
  const pts = blobs.map((b) => {
    let sx = 0, sy = 0;
    for (const i of b.pixels) { sx += i % W; sy += (i / W) | 0; }
    return { x: sx / b.area + 0.5, y: sy / b.area + 0.5 };
  });
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const pick = (left: boolean, top: boolean) => pts.find((p) => (p.x < cx) === left && (p.y < cy) === top);
  const ordered = [pick(true, true), pick(false, true), pick(false, false), pick(true, false)];
  return ordered.every(Boolean) ? (ordered as Pt[]) : null;
}
