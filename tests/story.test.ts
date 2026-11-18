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
  it('a drawing you click asks you something, and your answer decides what happens', () => {
    const [dog] = cast('dog');
    const dir = new Director(() => [dog], () => 0);
    dir.clicked(dog);
    expect(dog.bubble?.options).toEqual(['Fetch!', 'Nap']);
    dog.bubble!.onAnswer!('Nap');
    expect(dog.bubble?.text).toBe('zzz');
    expect(dir.caption?.text).toBe('The dog takes a nap.');
  });
  it('not sure what it is: it asks, and becomes your answer', () => {
    const [d] = cast('cat');
    const dir = new Director(() => [d], () => 0);
    let became = '';
    dir.askWhat(d, ['cat', 'dog'], (w) => (became = w));
    expect(d.bubble?.text).toBe('Am I a cat or a dog?');
    d.bubble!.onAnswer!('dog');
    expect(became).toBe('dog');
  });
  it('paused: no stories', () => {
    const [dog, cat] = cast('dog', 'cat');
    const dir = new Director(() => [dog, cat], () => 0);
    dir.update(true);
    expect(dir.caption).toBeNull();
  });
});
