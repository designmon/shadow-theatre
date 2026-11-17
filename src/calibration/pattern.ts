import type { Gray, Mask, Pt } from '../types';
import { findBlobs } from '../vision/blobs';

const INSET = 0.12;
const SIZE = 0.07; // half-size of each square, as a fraction of the picture height

/** Black screen with four white squares; returns their centers TL, TR, BR, BL (projector px). */
export function drawCalibrationPattern(ctx: CanvasRenderingContext2D, w: number, h: number): Pt[] {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const s = SIZE * h;
  const centers = [
    { x: w * INSET, y: h * INSET }, { x: w * (1 - INSET), y: h * INSET },
    { x: w * (1 - INSET), y: h * (1 - INSET) }, { x: w * INSET, y: h * (1 - INSET) },
  ];
  ctx.fillStyle = '#fff';
  for (const c of centers) ctx.fillRect(c.x - s, c.y - s, 2 * s, 2 * s);
  return centers;
}

export type MarkerResult = {
  points: Pt[] | null;
  /** How many square-like bright spots appeared (for the setup card). */
  seen: number;
  /** What got brighter when the squares appeared (shown on the setup card when it fails). */
  changed: Mask;
};

const MIN_DIFF = 15; // the squares must brighten the camera picture at least this much
const MAX_AREA_RATIO = 4; // the four squares look roughly the same size

/** Locate the four squares in the camera (lit minus dark), ordered TL, TR, BR, BL. */
export function findMarkers(lit: Gray, dark: Gray): Pt[] | null {
  return findMarkersDetailed(lit, dark).points;
}

export function findMarkersDetailed(lit: Gray, dark: Gray): MarkerResult {
  const { width: W, height: H } = lit;
  const changed: Mask = { width: W, height: H, data: new Uint8Array(W * H) };
  const diff = new Int16Array(W * H);
  let max = 0;
  for (let i = 0; i < diff.length; i++) { diff[i] = lit.data[i] - dark.data[i]; if (diff[i] > max) max = diff[i]; }
  if (max < MIN_DIFF) return { points: null, seen: 0, changed };
  for (let i = 0; i < diff.length; i++) changed.data[i] = diff[i] > max * 0.5 ? 1 : 0;
  const blobs = findBlobs(changed, 6).slice(0, 8);
  const cands = blobs.map((b) => {
    let sx = 0, sy = 0;
    for (const i of b.pixels) { sx += i % W; sy += (i / W) | 0; }
    return { p: { x: sx / b.area + 0.5, y: sy / b.area + 0.5 }, area: b.area };
  });

  // Try every set of 4: similar sizes, one per quadrant; prefer the most spread-out set.
  let best: Pt[] | null = null, bestSpread = -1;
  const n = cands.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    const set = [cands[a], cands[b], cands[c], cands[d]];
    const areas = set.map((s) => s.area);
    if (Math.max(...areas) > MAX_AREA_RATIO * Math.min(...areas)) continue;
    const pts = set.map((s) => s.p);
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
    const pick = (left: boolean, top: boolean) => pts.find((p) => (p.x < cx) === left && (p.y < cy) === top);
    const ordered = [pick(true, true), pick(false, true), pick(false, false), pick(true, false)];
    if (!ordered.every(Boolean) || new Set(ordered).size !== 4) continue;
    // area of the quadrilateral TL-TR-BR-BL (shoelace): a stray spot inside the real square set makes it smaller
    const q = ordered as Pt[];
    let spread = 0;
    for (let k = 0; k < 4; k++) { const u = q[k], v = q[(k + 1) % 4]; spread += u.x * v.y - v.x * u.y; }
    spread = Math.abs(spread) / 2;
    if (spread > bestSpread) { bestSpread = spread; best = ordered as Pt[]; }
  }
  return { points: best, seen: best ? 4 : Math.min(cands.length, 4), changed };
}
