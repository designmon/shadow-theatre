import { blob, ellipse, leg, type CreatureDef } from './rig';

// A side-view rabbit, facing right, hopping like a real one (half-bound):
// crouch → push off with the hind legs (body stretches) → flight with forepaws reaching →
// land on the forepaws while the hind feet swing in ahead of them → crouch. ~600 ms per hop.
const HOP_MS = 600;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => k * k * (3 - 2 * k);
// keyframes over one hop: [phase, stretch, hindAngle, foreAngle, earAngle]
const KEYS: number[][] = [
  [0.0, 0.86, 0.9, 0.05, -0.15], // crouched: hind feet under the body
  [0.22, 1.12, -1.15, 0.7, -0.55], // push off: hind legs straight back, forepaws reaching
  [0.5, 1.08, -0.7, 0.9, -0.6], // flight
  [0.72, 0.95, 0.6, -0.1, -0.35], // landing on forepaws, hind feet swinging forward
  [1.0, 0.86, 0.9, 0.05, -0.15],
];
function pose(p: number) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = ease((p - a[0]) / (b[0] - a[0]));
  return { stretch: lerp(a[1], b[1], k), hind: lerp(a[2], b[2], k), fore: lerp(a[3], b[3], k), ear: lerp(a[4], b[4], k) };
}
const airborne = (p: number) => (p > 0.18 && p < 0.74 ? Math.sin(((p - 0.18) / 0.56) * Math.PI) : 0);

export const rabbit: CreatureDef = {
  kind: 'rabbit',
  headBox: { x: 16, y: -78, w: 40, h: 72 }, // head + long ears = the two-finger shadow
  extent: { x: -62, y: -78, w: 118, h: 112 },
  speed: 2.2,
  introMs: 500,
  flips: true,
  wander: 3,
  // all the travel happens in the air
  pace: (t) => 3.2 * airborne((t / HOP_MS) % 1),
  bob: (t) => ({ x: 0, y: t > 500 ? -airborne(((t - 500) / HOP_MS) % 1) * 30 : 0 }),
  draw(ctx, t) {
    const moving = t > 500;
    const p = moving ? ((t - 500) / HOP_MS) % 1 : 0;
    const P = moving ? pose(p) : { stretch: 0.86, hind: 0.9, fore: 0.05, ear: -0.15 + Math.sin(t / 90) * 0.06 };
    const s = P.stretch;
    // big hind foot: long and flat, swung from the haunch
    const hipX = -26 * s, hipY = 8;
    // long hind leg: thigh + long shin; trails far behind on push-off, swings under on landing
    const [hfx, hfy] = leg(ctx, hipX, hipY, -P.hind, 20, P.hind * 0.35 + 0.8, 20, 18, 7);
    const footA = -P.hind * 0.6 + 0.15;
    ctx.save(); ctx.translate(hfx, hfy); ctx.rotate(footA); ellipse(ctx, 9, 0, 13, 4.5); ctx.restore();
    // forelegs: slim
    leg(ctx, 14 * s, 6, P.fore, 12, -0.2, 12, 7, 5);
    leg(ctx, 18 * s, 6, P.fore * 0.8 + 0.1, 12, -0.2, 12, 7, 5);
    // body: round haunch flowing into a smaller chest; stretches long in the air
    blob(ctx, [[24 * s, -10], [10 * s, -18], [-14 * s, -24], [-34 * s, -18], [-42 * s, -2], [-36 * s, 14], [-16 * s, 18], [6 * s, 14], [22 * s, 8]]);
    ellipse(ctx, -44 * s, -10, 8, 7); // cotton tail
    // head + ears
    const hx = 32 * s, hy = -18;
    ellipse(ctx, hx, hy, 12, 10.5);
    ellipse(ctx, hx + 10, hy + 3, 6, 5); // muzzle
    ctx.save();
    ctx.translate(hx - 2, hy - 8);
    ctx.rotate(P.ear);
    ellipse(ctx, -2, -24, 5.5, 22, -0.08);
    ctx.rotate(0.18);
    ellipse(ctx, 4, -23, 5, 21, 0.05);
    ctx.restore();
  },
};
