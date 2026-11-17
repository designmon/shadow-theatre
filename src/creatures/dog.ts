import { blob, ellipse, leg, taper, type CreatureDef } from './rig';

// A side-view dog, facing right, trotting: diagonal leg pairs move together
// (front-left with hind-right), two beats per ~460 ms stride. Barks on the spot first.
const STRIDE_MS = 460;
const BARK_START = 250, BARK_MS = 520;

export const dog: CreatureDef = {
  kind: 'dog',
  // the head (skull + muzzle + ear) is what the hand shadow makes
  headBox: { x: 40, y: -66, w: 52, h: 46 },
  extent: { x: -78, y: -66, w: 170, h: 132 },
  speed: 2.0,
  introMs: 900,
  flips: true,
  wander: 3,
  bob: (t) => ({ x: 0, y: -Math.abs(Math.sin((t / STRIDE_MS) * Math.PI * 2)) * 2.5 }),
  draw(ctx, t) {
    const moving = t > 900;
    const ph = moving ? ((t - 900) / STRIDE_MS) % 1 : 0;
    const swing = (p: number) => (moving ? Math.sin(p * Math.PI * 2) * 0.48 : 0);
    // knee folds while the leg swings forward (sin > 0 rising), straight while it pushes back
    const fold = (p: number) => (moving ? Math.max(0, Math.cos(p * Math.PI * 2)) * 0.9 : 0);
    const k = (t - BARK_START) / BARK_MS;
    const barking = k > 0 && k < 1;
    const bark = barking ? Math.sin(k * Math.PI) : 0;

    // tail: up and wagging (fast while barking, relaxed while trotting)
    const wag = Math.sin(t / (barking ? 55 : 120)) * (barking ? 0.35 : 0.18);
    // a curved, bushy tail: three tapering segments curling up
    let tx = -52, ty = -16, ta = -2.5 + wag;
    for (const [len, w0, w1, bend] of [[12, 10, 9, 0.25], [11, 9, 7, 0.3], [10, 7, 3, 0.35]]) {
      const nx = tx + Math.cos(ta) * len, ny = ty + Math.sin(ta) * len;
      taper(ctx, tx, ty, nx, ny, w0, w1);
      tx = nx; ty = ny; ta += bend + wag * 0.5;
    }

    // legs: far pair slightly offset, all black so they merge like a real shadow
    const fp = ph, fp2 = (ph + 0.5) % 1;
    leg(ctx, 24, 8, swing(fp2), 22, -fold(fp2) * 0.6, 23, 13, 7);   // front right (far)
    leg(ctx, -38, 4, swing(fp) - 0.25, 22, fold(fp) + 0.45, 24, 20, 7); // hind left (far): angled thigh, hock
    const [fx, fy] = leg(ctx, 28, 8, swing(fp), 22, -fold(fp) * 0.6, 23, 14, 7); // front left
    const [hx, hy] = leg(ctx, -34, 4, swing(fp2) - 0.25, 22, fold(fp2) + 0.45, 24, 21, 7); // hind right
    ellipse(ctx, -36, 4, 15, 13, -0.3); // muscular thigh
    ellipse(ctx, fx + 3, fy, 6, 3.5);
    ellipse(ctx, hx + 3, hy, 6, 3.5);

    // torso: deep chest, level back, tucked belly, rounded rump
    blob(ctx, [[38, -2], [34, -18], [18, -24], [-6, -22], [-30, -22], [-48, -18], [-56, -6], [-50, 10], [-36, 16], [-18, 10], [2, 12], [22, 20], [36, 12]]);

    // neck + head, head lifting when it barks
    ctx.save();
    ctx.translate(30, -16);
    ctx.rotate(-0.25 * bark);
    ctx.translate(-30, 16);
    blob(ctx, [[22, -18], [34, -42], [50, -48], [58, -34], [44, -14], [32, -4]]);
    ellipse(ctx, 56, -40, 14, 12); // skull
    blob(ctx, [[60, -48], [80, -44], [90, -38], [88, -32], [70, -30], [58, -32]]); // muzzle
    ellipse(ctx, 90, -40, 4.5, 4); // nose
    // lower jaw opens on each "woof"
    const jaw = barking ? Math.abs(Math.sin(k * Math.PI * 3)) * 0.5 : 0;
    ctx.save();
    ctx.translate(62, -31);
    ctx.rotate(jaw);
    blob(ctx, [[0, -2], [22, -4], [24, 0], [4, 4]]);
    ctx.restore();
    // ear: soft triangle, flicks while trotting
    ctx.save();
    ctx.translate(52, -50);
    ctx.rotate(-0.15 + (moving ? Math.sin(ph * Math.PI * 4) * 0.08 : 0));
    blob(ctx, [[-6, 0], [-4, -18], [2, -16], [8, 2]]);
    ctx.restore();
    // "woof" lines in front of the mouth
    if (barking) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const r = 10 + i * 8 + bark * 6;
        ctx.globalAlpha *= 1;
        ctx.beginPath();
        ctx.arc(92, -36, r, -0.5, 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
