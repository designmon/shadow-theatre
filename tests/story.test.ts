import { describe, expect, it } from 'vitest';
import { Doodle } from '../src/draw/doodle';
import { Director } from '../src/story/director';

const loop = (cx: number) => Array.from({ length: 40 }, (_, i) => ({ x: cx + Math.cos((i / 40) * 6.28) * 50, y: 300 + Math.sin((i / 40) * 6.28) * 40 }));
function cast(...labels: string[]) {
  return labels.map((label, i) => {
    const d = new Doodle([loop(300 + i * 200)], { w: 1920, h: 1080 });
    d.comeAlive('walk', label);
    d.park({ x: 1300 + i * 150, y: 800 }, 0.4);
    for (let t = 0; t < 8000; t += 50) d.update(50); // performs, then rests in its place
    return d;
  });
}

describe('stories between the drawings', () => {
  it('a dog and a cat: the dog goes over to the cat, and the caption tells it', () => {
    const [dog, cat] = cast('dog', 'cat');
    let now = 0;
    const dir = new Director(() => [dog, cat], () => now);
    dir.update(false);
    expect(dir.caption?.text).toBeTruthy();
    expect(dog.resting && cat.resting).toBe(false); // someone is on the move
    now = 4000; for (let t = 0; t < 4000; t += 50) { dog.update(50); cat.update(50); } dir.update(false);
    expect(dog.bubble || cat.bubble).toBeTruthy(); // and they talk
  });


  it('paused: no stories', () => {
    const [dog, cat] = cast('dog', 'cat');
    const dir = new Director(() => [dog, cat], () => 0);
    dir.update(true);
    expect(dir.caption).toBeNull();
  });
});

import { ScriptRunner } from '../src/story/script';

describe('voice commands acted out', () => {
  it('"the plane lands, the fish gets on, and they fly off" — and later they come back', () => {
    const [plane, fish] = cast('plane', 'fish');
    let now = 0;
    const tick = (ms: number) => { for (let t = 0; t < ms; t += 50) { now += 50; plane.update(50); fish.update(50); runner.update(); } };
    const runner = new ScriptRunner(() => ({ w: 1920, h: 1080 }), () => ({ x: 1150, y: 280, w: 710, h: 745 }), () => now);
    runner.play({ story: 'The plane lands and the fish climbs aboard. Off they fly!', steps: [
      { do: 'goto', who: plane.id, place: 'ground' },
      { do: 'goto', who: fish.id, near: plane.id },
      { do: 'ride', who: fish.id, on: plane.id },
      { do: 'say', who: fish.id, text: 'All aboard!' },
      { do: 'leave', who: plane.id, side: 'right' },
    ] }, [plane, fish]);
    tick(2000);
    expect(plane.where.y).toBeGreaterThan(900); // landed
    tick(2000);
    expect(fish.riding).toBe(plane);
    tick(4500);
    expect(plane.where.x).toBeGreaterThan(1920); // off the wall…
    expect(fish.where.x).toBeGreaterThan(1920); // …with its passenger
    tick(12000);
    expect(plane.where.x).toBeLessThan(1920); // and back home
    expect(fish.riding).toBeNull();
  });
});

import { AiArtist } from '../src/draw/aiHand';

describe('"draw a cat": the AI finger', () => {
  it('comes in, draws every stroke, leaves, and hands over the drawing', () => {
    const a = new AiArtist();
    let got: unknown = null;
    const strokes = [[{ x: 500, y: 400 }, { x: 700, y: 400 }], [{ x: 600, y: 300 }, { x: 600, y: 500 }]];
    a.start(strokes, { w: 1920, h: 1080 }, (s) => (got = s));
    expect(a.busy).toBe(true);
    for (let t = 0; t < 6000 && a.busy; t += 16) a.update(16);
    expect(a.busy).toBe(false);
    expect(got).toEqual(strokes);
  });
  it('a script can draw something new and then move it ("new")', async () => {
    const [cat] = cast('cat');
    let now = 0;
    const runner = new ScriptRunner(() => ({ w: 1920, h: 1080 }), () => ({ x: 1150, y: 280, w: 710, h: 745 }), () => now);
    const fresh = new Doodle([loop(600)], { w: 1920, h: 1080 });
    fresh.comeAlive('walk', 'dog', true);
    fresh.park({ x: 1500, y: 800 }, 0.4);
    let drew = '';
    runner.onDraw = async (what) => { drew = what; return fresh; };
    runner.play({ story: 'A dog appears and says hello to the cat.', steps: [{ do: 'draw', what: 'dog' }, { do: 'say', who: 'new', text: 'Hello!' }] }, [cat]);
    runner.update();
    expect(drew).toBe('dog');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    now += 500; runner.update();
    expect(fresh.bubble?.text).toBe('Hello!');
  });
});
