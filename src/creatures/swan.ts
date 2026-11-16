import { around, ellipse, poly, type CreatureDef } from './rig';

// Facing right. The hand = head + beak, the forearm = the long neck.
export const swan: CreatureDef = {
  kind: 'swan',
  headBox: { x: -20, y: -18, w: 64, h: 96 },
  extent: { x: -150, y: -18, w: 200, h: 150 },
  speed: 1.1,
  introMs: 500,
  flips: true,
  bob: (t) => ({ x: 0, y: Math.sin(t / 420) * 6 }),
  draw(ctx, t) {
    const sway = Math.sin(t / 500) * 0.08;
    const lift = Math.max(0, Math.sin((t - 900) / 380)) * (t > 900 && t < 2100 ? 1 : 0);
    // body: a fat teardrop with a pointed tail
    ellipse(ctx, -50, 96, 78, 32);
    poly(ctx, -120, 84, -158, 58, -112, 104);
    // wing, lifts once
    around(ctx, -30, 80, -lift * 0.9, () => poly(ctx, -10, 82, -60, 50, -120, 70, -70, 92));
    // neck S-curve + head + beak, swaying
    around(ctx, -6, 90, sway, () => {
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-6, 90);
      ctx.bezierCurveTo(28, 60, -26, 34, 0, 4);
      ctx.stroke();
      ellipse(ctx, 4, 0, 17, 13);
      poly(ctx, 16, -6, 44, 4, 16, 9);
    });
  },
};
