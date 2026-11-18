import type { Box, Pt } from '../types';

/**
 * Finished drawings move to the side of the wall and make a little landscape together: things
 * that fly in the sky, things that stand on a ground line, things that float or swim on a
 * water line. Each gets a sensible size relative to the others (a tree is taller than a cat),
 * and the scene adds a few quiet details of its own (grass, waves, two far-off birds).
 */
export type Zone = 'sky' | 'ground' | 'water';
const ZONE: Record<string, Zone> = {
  bird: 'sky', butterfly: 'sky', plane: 'sky', sun: 'sky', moon: 'sky', cloud: 'sky', star: 'sky', heart: 'sky', something: 'sky', circle: 'sky', face: 'sky',
  fish: 'water', boat: 'water',
};
export const zoneOf = (label: string): Zone => ZONE[label] ?? 'ground';

/** Height on the wall, as a share of the composition's height. */
const HEIGHT: Record<string, number> = {
  tree: 0.36, house: 0.3, person: 0.28, car: 0.14, flower: 0.18, cat: 0.13, dog: 0.14, rabbit: 0.13, turtle: 0.1, snake: 0.07,
  sun: 0.16, moon: 0.14, cloud: 0.1, bird: 0.06, butterfly: 0.09, plane: 0.08, star: 0.07, heart: 0.09, face: 0.13, circle: 0.1, something: 0.12,
  boat: 0.17, fish: 0.08,
};
const MAX_IN_ZONE: Record<Zone, number> = { sky: 6, ground: 6, water: 4 };

/** A drawing's resting shape, measured around its own centre (local coordinates). */
export type Item = { label: string; top: number; bottom: number; left: number; right: number };
export type Placement = { at: Pt; scale: number } | null; // null: no room, let it go
export type Decor = { area: Box; groundY: number | null; waterY: number | null; tufts: number[]; farBirds: Pt[] };

/** The side of the wall the composition lives in (leaves the rest free for drawing). */
export function compositionArea(wall: { w: number; h: number }): Box {
  return { x: wall.w * 0.6, y: wall.h * 0.17, w: wall.w * 0.37, h: wall.h * 0.78 };
}

export function layout(items: Item[], area: Box): { places: Placement[]; decor: Decor } {
  const places: Placement[] = items.map(() => null);
  const byZone: Record<Zone, number[]> = { sky: [], ground: [], water: [] };
  items.forEach((it, i) => byZone[zoneOf(it.label)].push(i));
  // too many in a zone: the oldest go
  for (const z of Object.keys(byZone) as Zone[]) byZone[z] = byZone[z].slice(-MAX_IN_ZONE[z]);
  const hasWater = byZone.water.length > 0, hasGround = byZone.ground.length > 0;
  const waterY = hasWater ? area.y + area.h * 0.9 : null;
  const groundY = hasGround ? area.y + area.h * (hasWater ? 0.74 : 0.92) : null;
  const scaleFor = (it: Item) => Math.min(1, (area.h * (HEIGHT[it.label] ?? 0.12)) / Math.max(1, it.bottom - it.top));
  const across = (n: number, k: number) => area.x + ((k + 0.5) / n) * area.w;

  // ground: standing on the line, spread across, tall things toward the back edges
  const ground = byZone.ground;
  ground.forEach((i, k) => {
    const it = items[i], s = scaleFor(it);
    places[i] = { at: { x: across(ground.length, k), y: groundY! - it.bottom * s }, scale: s };
  });
  // water: boats sit on the line, fish swim just under it
  const water = byZone.water;
  water.forEach((i, k) => {
    const it = items[i], s = scaleFor(it);
    const y = it.label === 'boat' ? waterY! - it.bottom * s + area.h * 0.01 : waterY! + area.h * 0.05;
    places[i] = { at: { x: across(water.length, k), y }, scale: s };
  });
  // sky: the sun or moon in the corner, the rest spread out at gently varied heights
  const skyBottom = (groundY ?? waterY ?? area.y + area.h) - area.h * 0.4;
  const sky = byZone.sky.filter((i) => items[i].label !== 'sun' && items[i].label !== 'moon');
  const lights = byZone.sky.filter((i) => items[i].label === 'sun' || items[i].label === 'moon');
  lights.forEach((i, k) => { const s = scaleFor(items[i]); places[i] = { at: { x: area.x + area.w * (0.86 - k * 0.2), y: area.y + area.h * 0.1 }, scale: s }; });
  const heights = [0.32, 0.12, 0.42, 0.2, 0.36, 0.08];
  sky.forEach((i, k) => {
    const s = scaleFor(items[i]);
    const y = area.y + Math.min(skyBottom - area.y, area.h * 0.5) * (heights[k % heights.length] + 0.15);
    places[i] = { at: { x: area.x + area.w * (0.08 + ((k + 0.5) / Math.max(1, sky.length)) * (lights.length ? 0.62 : 0.84)), y }, scale: s };
  });

  // the scene's own details: grass by the plants, two far-off birds following a bird
  const tufts = ground.filter((i) => ['flower', 'tree', 'house', 'rabbit'].includes(items[i].label)).map((i) => places[i]!.at.x + area.w * 0.04);
  const bird = sky.find((i) => items[i].label === 'bird');
  const farBirds = bird !== undefined ? [{ x: places[bird]!.at.x - area.w * 0.12, y: places[bird]!.at.y + area.h * 0.05 }, { x: places[bird]!.at.x - area.w * 0.2, y: places[bird]!.at.y - area.h * 0.02 }] : [];
  return { places, decor: { area, groundY, waterY, tufts, farBirds } };
}

/** Draw the scene's own details in the ink (thin, quiet). */
export function drawDecor(ctx: CanvasRenderingContext2D, d: Decor, ink: string, t: number, alpha = 1): void {
  if (alpha <= 0) return;
  const { area } = d;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.7 * alpha;
  ctx.lineWidth = 2.5;
  if (d.groundY !== null) {
    ctx.beginPath(); ctx.moveTo(area.x, d.groundY); ctx.lineTo(area.x + area.w, d.groundY); ctx.stroke();
    for (const x of d.tufts) {
      const y = d.groundY;
      ctx.beginPath();
      ctx.moveTo(x - 7, y); ctx.lineTo(x - 4, y - 9); ctx.moveTo(x, y); ctx.lineTo(x, y - 12); ctx.moveTo(x + 7, y); ctx.lineTo(x + 4, y - 9);
      ctx.stroke();
    }
  }
  if (d.waterY !== null) {
    ctx.beginPath();
    for (let x = area.x; x <= area.x + area.w; x += 4) {
      const y = d.waterY + Math.sin((x - area.x) / 22 + t / 900) * 4;
      if (x === area.x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 2;
  d.farBirds.forEach((b, k) => {
    const flap = Math.sin(t / 260 + k * 1.7) * 4, w = 9 - k * 2;
    ctx.beginPath(); ctx.moveTo(b.x - w, b.y - flap); ctx.quadraticCurveTo(b.x - w / 2, b.y - 5, b.x, b.y); ctx.quadraticCurveTo(b.x + w / 2, b.y - 5, b.x + w, b.y - flap); ctx.stroke();
  });
  ctx.restore();
}
