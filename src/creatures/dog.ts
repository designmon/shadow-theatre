import { around, ellipse, poly, rrect, type CreatureDef } from './rig';

// Facing right. Head ~ (-32..58, -62..24). Body trails to the left.
export const dog: CreatureDef = {
  kind: 'dog',
  headBox: { x: -32, y: -62, w: 90, h: 86 },
  extent: { x: -200, y: -62, w: 258, h: 150 },
  speed: 2.4,
  flips: true,
  bob: (t) => ({ x: 0, y: -Math.abs(Math.sin(t / 110)) * 5 }),
  draw(ctx, t) {
    const step = Math.sin(t / 110);
    const barking = t > 350 && t < 750;
    // tail (wagging)
    around(ctx, -170, 18, -0.7 + Math.sin(t / 70) * 0.35, () => rrect(ctx, -176, -40, 14, 62, 7));
    // legs: two pairs swinging in opposition
    const leg = (x: number, a: number) => around(ctx, x, 60, a, () => rrect(ctx, x - 9, 52, 18, 40, 8));
    leg(-160, step * 0.5); leg(-140, -step * 0.5); leg(-60, -step * 0.5); leg(-40, step * 0.5);
    // body + neck
    rrect(ctx, -180, 6, 160, 60, 30);
    poly(ctx, -40, 14, -18, -20, 18, -8, 0, 40);
    // head
    rrect(ctx, -32, -36, 66, 56, 24);
    // ear (floppy, flicks back while trotting)
    around(ctx, -6, -30, step * 0.15, () => poly(ctx, -20, -28, -6, -62, 12, -30));
    // snout: upper jaw, lower jaw opens when barking
    rrect(ctx, 18, -18, 40, 22, 10);
    around(ctx, 22, 4, barking ? 0.45 * Math.sin(((t - 350) / 400) * Math.PI) : 0, () => rrect(ctx, 18, 0, 34, 14, 7));
  },
};
