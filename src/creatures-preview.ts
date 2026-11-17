// Mockup page: each creature walks/hops/flutters/glides across its own lane, looping.
// ?still freezes them mid-wall for a poster view.
import { createCreature, DEFS } from './creatures';
import type { RiggedCreature } from './creatures/rig';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const labels = document.getElementById('labels')!;
const kinds = Object.keys(DEFS) as (keyof typeof DEFS)[];
const params = new URLSearchParams(location.search);
const still = params.get('still');
const strip = params.get('strip'); // ?strip=dog&from=900&step=58 : frames of one stride side by side
if (strip) {
  const def = DEFS[strip as keyof typeof DEFS];
  const from = Number(params.get('from') ?? 900), step = Number(params.get('step') ?? 60), n = Number(params.get('n') ?? 8);
  const W = innerWidth * devicePixelRatio, H = innerHeight * devicePixelRatio;
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, W, H);
  const cell = W / n, sc = cell / 190;
  for (let i = 0; i < n; i++) {
    const t = from + i * step;
    const bob = def.bob ? def.bob(t) : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(cell * i + cell * 0.5, H * 0.55);
    ctx.scale(sc, sc);
    ctx.translate(bob.x, bob.y);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    ctx.filter = 'blur(1px)';
    def.draw(ctx, t);
    ctx.restore();
    ctx.fillStyle = '#8a8478'; ctx.font = `${14 * devicePixelRatio}px system-ui`;
    ctx.fillText(`${t} ms`, cell * i + 10, H - 12);
  }
  throw new Error('strip mode: static');
}

function size() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
}
size();
addEventListener('resize', size);

const lanes: { kind: (typeof kinds)[number]; c: RiggedCreature }[] = [];
function spawn(i: number): RiggedCreature {
  const W = canvas.width, H = canvas.height, laneH = H / kinds.length;
  const head = laneH * 0.42;
  return createCreature(kinds[i], {
    anchorBox: { x: W * 0.06, y: laneH * i + laneH * 0.42 - head / 2, w: head, h: head },
    facing: 'right', openSide: 'right', wall: { w: W, h: H }, avoid: null,
  });
}
kinds.forEach((kind, i) => {
  lanes.push({ kind, c: spawn(i) });
  labels.insertAdjacentHTML('beforeend', `<div style="top:${(100 / kinds.length) * i + 1}%">${kind}</div>`);
});
if (still) for (const l of lanes) for (let t = 0; t < Number(still); t += 16) l.c.update(16);

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(50, now - last);
  last = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  lanes.forEach((l, i) => {
    if (!still) l.c.update(dt);
    if (l.c.done) l.c = spawn(i);
    l.c.draw(ctx);
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
