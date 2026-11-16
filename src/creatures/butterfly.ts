import { ellipse, rrect, type CreatureDef } from './rig';

// Symmetric; the whole butterfly matches the two-hand shadow.
export const butterfly: CreatureDef = {
  kind: 'butterfly',
  headBox: { x: -70, y: -62, w: 140, h: 118 },
  extent: { x: -70, y: -62, w: 140, h: 118 },
  speed: 2.6,
  flips: false,
  bob: (t) => ({ x: Math.sin(t / 380) * 18, y: Math.sin(t / 170) * 22 }),
  draw(ctx, t) {
    const flap = 0.2 + 0.8 * Math.abs(Math.cos((t / 1000) * Math.PI * 3.2));
    // body + antennae
    rrect(ctx, -6, -34, 12, 72, 6);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -32); ctx.quadraticCurveTo(-10, -52, -22, -58);
    ctx.moveTo(2, -32); ctx.quadraticCurveTo(10, -52, 22, -58);
    ctx.stroke();
    // wings: squashed horizontally to flap
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(flap, 1);
      ellipse(ctx, side * 36, -14, 36, 28, side * 0.35);
      ellipse(ctx, side * 26, 26, 24, 22, -side * 0.4);
      ctx.restore();
    }
  },
};
