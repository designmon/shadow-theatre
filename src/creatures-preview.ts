// Mockup page: each creature walks/hops/flutters/glides across its own lane, looping.
// ?still freezes them mid-wall for a poster view.
import { createCreature, DEFS } from './creatures';
import type { RiggedCreature } from './creatures/rig';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const labels = document.getElementById('labels')!;
const kinds = Object.keys(DEFS) as (keyof typeof DEFS)[];
const still = new URLSearchParams(location.search).get('still');

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
