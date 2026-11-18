import type { Box, Pt } from '../types';

/**
 * Speech bubbles on the wall: what a drawing says, or a question with a few answers you can
 * click (a quick fist over one). Drawn in the ink blue on white, so the camera never takes them
 * for shadows.
 */
export type Bubble = {
  text: string;
  options?: string[];
  at: number; // when it appeared (ms)
  ms: number; // how long it stays
  onAnswer?: (option: string) => void;
};

const FONT = '300 17px "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
const PAD = 12, CHIP_H = 30, GAP = 8;

export type BubbleLayout = { box: Box; chips: { option: string; box: Box }[] };

function measure(ctx: CanvasRenderingContext2D, b: Bubble, anchor: Pt, wall: { w: number; h: number }, avoid: Box[] = []): BubbleLayout {
  ctx.save();
  ctx.font = FONT;
  const textW = ctx.measureText(b.text).width;
  const chipWs = (b.options ?? []).map((o) => ctx.measureText(o).width + 28);
  ctx.restore();
  const chipsW = chipWs.reduce((a, c) => a + c, 0) + Math.max(0, chipWs.length - 1) * GAP;
  const w = Math.max(textW, chipsW) + PAD * 2, h = PAD * 2 + 20 + (b.options?.length ? CHIP_H + 10 : 0);
  // above the drawing, kept on the wall
  const x = Math.min(wall.w - w - 10, Math.max(10, anchor.x - w / 2));
  let y = Math.max(10, anchor.y - h - 18);
  // don't sit on another bubble: move up above it
  for (let tries = 0; tries < 6; tries++) {
    const hit = avoid.find((o) => x < o.x + o.w + 6 && x + w > o.x - 6 && y < o.y + o.h + 6 && y + h > o.y - 6);
    if (!hit) break;
    y = hit.y - h - 10;
  }
  let cx = x + (w - chipsW) / 2;
  const chips = (b.options ?? []).map((option, i) => { const box = { x: cx, y: y + PAD + 30, w: chipWs[i], h: CHIP_H }; cx += chipWs[i] + GAP; return { option, box }; });
  return { box: { x, y, w, h }, chips };
}

export function drawBubble(ctx: CanvasRenderingContext2D, b: Bubble, anchor: Pt, wall: { w: number; h: number }, ink: string, now: number, hoverAt?: Pt | null, avoid: Box[] = []): BubbleLayout {
  const L = measure(ctx, b, anchor, wall, avoid);
  const age = now - b.at, a = Math.min(1, age / 220) * Math.min(1, (b.ms - age) / 400);
  if (a <= 0) return L;
  const { x, y, w, h } = L.box;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill(); ctx.stroke();
  // the tail, toward the speaker
  const tx = Math.min(x + w - 22, Math.max(x + 22, anchor.x));
  ctx.beginPath(); ctx.moveTo(tx - 8, y + h); ctx.lineTo(tx, y + h + 12); ctx.lineTo(tx + 8, y + h); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx - 8, y + h); ctx.lineTo(tx, y + h + 12); ctx.lineTo(tx + 8, y + h); ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.text, x + w / 2, y + PAD + 10);
  for (const c of L.chips) {
    const over = hoverAt && hits(c.box, hoverAt, 14);
    ctx.lineWidth = over ? 3 : 1.5;
    ctx.beginPath(); ctx.roundRect(c.box.x, c.box.y, c.box.w, c.box.h, 15); ctx.stroke();
    ctx.fillText(c.option, c.box.x + c.box.w / 2, c.box.y + c.box.h / 2 + 1);
  }
  ctx.restore();
  return L;
}

/** A shadow's click is not precise: a little slack around a target. */
export function hits(box: Box, p: Pt, slack = 24): boolean {
  return p.x > box.x - slack && p.x < box.x + box.w + slack && p.y > box.y - slack && p.y < box.y + box.h + slack;
}

/** Which answer a click lands on (nearest chip within reach). */
export function chipAt(L: BubbleLayout, p: Pt): string | null {
  let best: string | null = null, bd = Infinity;
  for (const c of L.chips) {
    if (!hits(c.box, p, 40)) continue;
    const d = Math.hypot(p.x - (c.box.x + c.box.w / 2), p.y - (c.box.y + c.box.h / 2));
    if (d < bd) { bd = d; best = c.option; }
  }
  return best;
}
