import type { Doodle, RunwayFit, Shape } from '../draw/doodle';
import { drawingPrompt, scenePrompt } from './prompts';

/** Runway image size for one drawing (16:9). */
export const RW = 1280, RH = 720;
const WALL_INK = 7; // the wall's line weight at full size (render.ts)
const THICKER = 1.6; // a bit bolder than on the wall, so the line survives generation

/** Centre the drawing in the image, filling about 70% of it. */
export function fitForExport(shapes: Shape[], w = RW, h = RH, fill = 0.7): RunwayFit {
  const pts = shapes.flatMap((s) => s.pts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((w * fill) / Math.max(1, x1 - x0), (h * fill) / Math.max(1, y1 - y0));
  return { s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h };
}

function inkShapes(ctx: OffscreenCanvasRenderingContext2D, shapes: Shape[], map: (x: number, y: number) => [number, number], lineWidth: number) {
  ctx.strokeStyle = ctx.fillStyle = '#000';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const sh of shapes) {
    if (sh.pts.length < 2) continue;
    ctx.beginPath();
    sh.pts.forEach((p, i) => { const [x, y] = map(p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (sh.closed) ctx.closePath();
    if (sh.fill) ctx.fill();
    ctx.stroke();
  }
}

async function toBase64(c: OffscreenCanvas): Promise<string> {
  const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function post(name: string, png: string, prompt: string, meta: unknown): Promise<boolean> {
  try {
    const r = await fetch('/api/runway/in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, png, prompt, meta }) });
    return r.ok;
  } catch {
    return false;
  }
}

/** One drawing: its resting shape, black on white, centred, 1280 x 720, plus its prompt. */
export async function exportDrawing(d: Doodle): Promise<string | null> {
  if (!d.id) return null;
  const shapes = d.restShape();
  if (!shapes.length) return null;
  const fit = fitForExport(shapes);
  const c = new OffscreenCanvas(RW, RH), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, RW, RH);
  inkShapes(ctx, shapes, (x, y) => [RW / 2 + (x - fit.cx) * fit.s, RH / 2 + (y - fit.cy) * fit.s], Math.min(22, Math.max(6, WALL_INK * THICKER * fit.s)));
  const prompt = drawingPrompt(d.what, d.how ?? 'float');
  const ok = await post(d.id, await toBase64(c), prompt, { kind: 'drawing', id: d.id, label: d.what, motion: d.how, fit, made: new Date().toISOString() });
  if (ok) d.runwayFit = fit;
  return ok ? d.id : null;
}

/** The whole wall at projector resolution: every drawing where it is now, plus the scene prompt. */
export async function exportScene(doodles: Doodle[], stageCss: { w: number; h: number }, canvasPx: { w: number; h: number }): Promise<string | null> {
  const d = new Date(), p2 = (v: number) => String(v).padStart(2, '0');
  const name = `scene-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const k = canvasPx.w / stageCss.w;
  const c = new OffscreenCanvas(canvasPx.w, canvasPx.h), ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvasPx.w, canvasPx.h);
  const items = doodles.filter((x) => !x.retiring).map((x) => ({ d: x, now: x.shapeNow() }));
  for (const { now } of items) inkShapes(ctx, now.shapes, (x, y) => [x * k, y * k], now.lineWidth * THICKER * k);
  const prompt = scenePrompt(items.map(({ d: x }) => ({ label: x.what, motion: x.how ?? 'float' })));
  const meta = { kind: 'scene', name, stage: stageCss, size: canvasPx, drawings: items.map(({ d: x }) => ({ id: x.id, label: x.what, motion: x.how })), made: d.toISOString() };
  return (await post(name, await toBase64(c), prompt, meta)) ? name : null;
}
