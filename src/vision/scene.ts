import type { Box, Mask, Side } from '../types';
import type { Blob } from './blobs';

export type Scene = { puppet: Mask; puppetBox: Box; entry: Side | null; openSide: Side; bodyBox: Box | null };

const TIP_FRACTION = 0.3;

function boxOf(indices: Iterable<number>, W: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of indices) {
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The performer's shadow: where it enters the frame, the "puppet" (the far
 * tip, where the hands are), and the open side for creatures to move into.
 */
export function analyzeScene(mask: Mask, blobs: Blob[]): Scene | null {
  const blob = blobs[0];
  if (!blob) return null;
  const { width: W, height: H } = mask;
  const sides: Side[] = ['left', 'right', 'up', 'down'];
  const best = sides.reduce((a, b) => (blob.touches[b] > blob.touches[a] ? b : a));
  const entry: Side | null = blob.touches[best] > 0 ? best : null;
  const puppet: Mask = { width: W, height: H, data: new Uint8Array(W * H) };

  if (!entry) {
    for (const i of blob.pixels) puppet.data[i] = 1;
    const b = blob.box;
    const gaps: Record<Side, number> = { left: b.x, right: W - (b.x + b.w), up: b.y, down: H - (b.y + b.h) };
    const openSide = sides.reduce((a, c) => (gaps[c] > gaps[a] ? c : a));
    return { puppet, puppetBox: b, entry: null, openSide, bodyBox: null };
  }

  // Coordinate along the entry axis, measured from the entry edge.
  const along = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    return entry === 'left' ? x : entry === 'right' ? W - 1 - x : entry === 'up' ? y : H - 1 - y;
  };
  let far = 0;
  for (const i of blob.pixels) far = Math.max(far, along(i));
  const span = (entry === 'left' || entry === 'right' ? W : H) * TIP_FRACTION;
  const tip: number[] = [], body: number[] = [];
  for (const i of blob.pixels) (far - along(i) <= span ? tip : body).push(i);
  for (const i of tip) puppet.data[i] = 1;
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', up: 'down', down: 'up' };
  return { puppet, puppetBox: boxOf(tip, W)!, entry, openSide: opposite[entry], bodyBox: boxOf(body, W) };
}
