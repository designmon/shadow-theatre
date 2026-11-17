import type { CreatureDef } from './rig';

// A chunky heart that beats and floats away. The whole heart matches the two-hand shadow.
export const heart: CreatureDef = {
  kind: 'heart',
  headBox: { x: -60, y: -52, w: 120, h: 112 },
  extent: { x: -60, y: -52, w: 120, h: 112 },
  speed: 1.2,
  introMs: 700, // a couple of beats on the spot first
  flips: false,
  bob: (t) => ({ x: Math.sin(t / 520) * 10, y: Math.sin(t / 300) * 4 }),
  draw(ctx, t) {
    const beat = 1 + 0.12 * Math.max(0, Math.sin((t / 1000) * Math.PI * 2 * 1.4)) ** 6; // quick lub-dub pulse
    ctx.save();
    ctx.scale(beat, beat);
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.bezierCurveTo(-30, 30, -60, 8, -60, -18);
    ctx.bezierCurveTo(-60, -40, -44, -52, -28, -52);
    ctx.bezierCurveTo(-14, -52, -4, -44, 0, -32);
    ctx.bezierCurveTo(4, -44, 14, -52, 28, -52);
    ctx.bezierCurveTo(44, -52, 60, -40, 60, -18);
    ctx.bezierCurveTo(60, 8, 30, 30, 0, 58);
    ctx.fill();
    ctx.restore();
  },
};
