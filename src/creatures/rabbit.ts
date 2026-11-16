import { around, ellipse, type CreatureDef } from './rig';

const HOP_MS = 520;

// Facing right. Head + ears ~ (-30..30, -96..26).
export const rabbit: CreatureDef = {
  kind: 'rabbit',
  headBox: { x: -30, y: -96, w: 60, h: 122 },
  extent: { x: -130, y: -96, w: 160, h: 170 },
  speed: 1.5,
  introMs: 400,
  flips: true,
  bob: (t) => ({ x: 0, y: -Math.abs(Math.sin((t / HOP_MS) * Math.PI)) * 46 }),
  draw(ctx, t) {
    const phase = Math.abs(Math.sin((t / HOP_MS) * Math.PI));
    // body, tail, hind leg stretched mid-hop
    ellipse(ctx, -62, 34, 58, 38);
    ellipse(ctx, -122, 22, 14, 14);
    around(ctx, -82, 58, -0.2 - phase * 0.6, () => ellipse(ctx, -82, 66, 34, 12));
    ellipse(ctx, -10, 62, 14, 10); // front paw
    // head
    ellipse(ctx, 0, 0, 30, 26);
    ellipse(ctx, 26, 6, 10, 9); // nose bump
    // ears: tilt back with the hop
    around(ctx, -6, -18, -0.15 - phase * 0.25, () => ellipse(ctx, -10, -58, 9, 38, -0.1));
    around(ctx, 8, -18, -0.05 - phase * 0.2, () => ellipse(ctx, 10, -60, 9, 38, 0.15));
  },
};
