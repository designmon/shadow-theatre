import type { Pt } from '../types';
import type { PenState } from './pen';

const INK = 7;
/**
 * The ink: a vivid blue, not black. To the camera, black ink looks exactly like a shadow; blue ink
 * still sends the projector's full blue light, so it reads as lit wall (vision/light.ts).
 * Every colour we project keeps blue at full strength for the same reason.
 */
export const INK_COLOR = 'rgb(35,70,255)';
const FRESH_PX = 70; // the freshest stretch of line glows in the accent colours, settling into the ink
/** The accent, shifting blue → violet → magenta (blue at full in each: see INK_COLOR). */
export const ACCENT = ['47,107,255', '139,61,255', '214,48,255'];

export function accentAt(k: number): string {
  const x = Math.max(0, Math.min(0.999, k)) * (ACCENT.length - 1), i = Math.floor(x), f = x - i;
  const a = ACCENT[i].split(',').map(Number), b = ACCENT[i + 1].split(',').map(Number);
  return a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',');
}

/** Smooth curve through points (quadratic through midpoints). */
function curve(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  const z = pts[pts.length - 1];
  ctx.lineTo(z.x, z.y);
}

/** Split a stroke at FRESH_PX from its end: [settled ink, fresh glowing part]. */
function splitFresh(pts: Pt[]): [Pt[], Pt[]] {
  let d = 0, i = pts.length - 1;
  while (i > 0 && d < FRESH_PX) { d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); i--; }
  return [pts.slice(0, i + 1), pts.slice(i)];
}

/** The pen: a precise ink dot in a vivid ring; ink that cools from accent to black behind it. */
export function drawPen(ctx: CanvasRenderingContext2D, pen: PenState, tMs = performance.now()): void {
  if (pen.mode === 'idle' || !pen.cursor) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  pen.strokes.forEach((pts, si) => {
    if (pts.length < 2) return;
    const live = si === pen.strokes.length - 1 && pen.mode === 'down';
    const [settled, fresh] = live ? splitFresh(pts) : [pts, []];
    if (settled.length > 1) { ctx.strokeStyle = INK_COLOR; ctx.lineWidth = INK; curve(ctx, settled); ctx.stroke(); }
    for (let i = 1; i < fresh.length; i++) {
      const k = i / fresh.length; // 0 = cooling end, 1 = at the tip
      ctx.strokeStyle = `rgba(${accentAt(k)},${0.55 + 0.45 * k})`;
      ctx.lineWidth = INK * (1 + 0.25 * k);
      ctx.beginPath(); ctx.moveTo(fresh[i - 1].x, fresh[i - 1].y); ctx.lineTo(fresh[i].x, fresh[i].y); ctx.stroke();
    }
  });
  const { x, y } = pen.cursor;
  const hue = accentAt((Math.sin(tMs / 900) + 1) / 2);
  if (pen.mode === 'arming') {
    ctx.strokeStyle = `rgba(${hue},0.95)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + pen.arm * Math.PI * 2); ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(x, y, 8, x, y, 30);
    g.addColorStop(0, `rgba(${hue},0.28)`);
    g.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${hue},1)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 12 + Math.sin(tMs / 260) * 0.8, 0, Math.PI * 2); ctx.stroke();
    if (pen.mode === 'down') { ctx.fillStyle = `rgba(${hue},1)`; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}


function strokesOn(ctx: OffscreenCanvasRenderingContext2D, strokes: Pt[][], map: (p: Pt) => Pt, width: number) {
  ctx.fillStyle = ctx.strokeStyle = '#000';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pts of strokes) {
    ctx.beginPath();
    pts.forEach((p, i) => { const q = map(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.stroke();
  }
}

/** The drawing as a square 512 px picture (black lines on white) for recognition. */
export async function doodleToPng(strokes: Pt[][]): Promise<Blob> {
  const S = 512, c = new OffscreenCanvas(S, S), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  const all = strokes.flat(), xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0, size = Math.max(w, h, 1);
  const k = (S * 0.8) / size, ox = (S - w * k) / 2, oy = (S - h * k) / 2;
  strokesOn(ctx, strokes, (p) => ({ x: ox + (p.x - x0) * k, y: oy + (p.y - y0) * k }), 10);
  return c.convertToBlob({ type: 'image/png' });
}
