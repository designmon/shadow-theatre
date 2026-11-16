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
export function analyzeScene(mask: Mask, blobs: Blob[], lit?: Mask): Scene | null {
  const blob = blobs[0];
  if (!blob) return null;
  const { width: W, height: H } = mask;
  const sides: Side[] = ['left', 'right', 'up', 'down'];
  const puppet: Mask = { width: W, height: H, data: new Uint8Array(W * H) };

  // Where the shadow comes in: centroid of its pixels on the wall's edge.
  const off = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || (lit ? !lit.data[y * W + x] : false);
  let ax = 0, ay = 0, n = 0;
  for (const i of blob.pixels) {
    const x = i % W, y = (i / W) | 0;
    if (off(x - 1, y) || off(x + 1, y) || off(x, y - 1) || off(x, y + 1)) { ax += x; ay += y; n++; }
  }

  if (n === 0) {
    for (const i of blob.pixels) puppet.data[i] = 1;
    const b = blob.box;
    const gaps: Record<Side, number> = { left: b.x, right: W - (b.x + b.w), up: b.y, down: H - (b.y + b.h) };
    const openSide = sides.reduce((a, c) => (gaps[c] > gaps[a] ? c : a));
    return { puppet, puppetBox: b, entry: null, openSide, bodyBox: null };
  }
  ax /= n; ay /= n;

  // The puppet is the far end: the pixel farthest from the entry point sets the reach direction.
  let fx = ax, fy = ay, best = -1;
  for (const i of blob.pixels) {
    const x = i % W, y = (i / W) | 0;
    const d = (x - ax) ** 2 + (y - ay) ** 2;
    if (d > best) { best = d; fx = x; fy = y; }
  }
  const dx = fx - ax, dy = fy - ay;
  const openSide: Side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up';
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', up: 'down', down: 'up' };

  // Distance (along the reach axis) back from the farthest point.
  const back = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    return openSide === 'right' ? fx - x : openSide === 'left' ? x - fx : openSide === 'down' ? fy - y : y - fy;
  };
  const span = (openSide === 'left' || openSide === 'right' ? W : H) * TIP_FRACTION;
  const tip: number[] = [], body: number[] = [];
  for (const i of blob.pixels) (back(i) <= span ? tip : body).push(i);
  for (const i of tip) puppet.data[i] = 1;
  return { puppet, puppetBox: boxOf(tip, W)!, entry: opposite[openSide], openSide, bodyBox: boxOf(body, W) };
}

const MAX_PUPPET_FRACTION = 0.25; // of the lit wall
const TOUCH_PX = 3;

/**
 * Whether a scene's puppet is a trustworthy hand shape: not partly hidden by
 * (touching) one of our own projected creatures, and not so big it must be a body.
 */
export function isUsablePuppet(scene: Scene, ownDarkCam: Mask, lit: Mask): boolean {
  let litArea = 0;
  for (const v of lit.data) litArea += v;
  const b = scene.puppetBox;
  if (b.w * b.h > MAX_PUPPET_FRACTION * litArea) return false;
  const W = ownDarkCam.width, H = ownDarkCam.height;
  for (let y = Math.max(0, b.y - TOUCH_PX); y < Math.min(H, b.y + b.h + TOUCH_PX); y++) {
    for (let x = Math.max(0, b.x - TOUCH_PX); x < Math.min(W, b.x + b.w + TOUCH_PX); x++) {
      if (!ownDarkCam.data[y * W + x]) continue;
      // is any puppet pixel within TOUCH_PX of this dark pixel?
      for (let dy = -TOUCH_PX; dy <= TOUCH_PX; dy++) for (let dx = -TOUCH_PX; dx <= TOUCH_PX; dx++) {
        const px = x + dx, py = y + dy;
        if (px >= 0 && py >= 0 && px < W && py < H && scene.puppet.data[py * W + px]) return false;
      }
    }
  }
  return true;
}
