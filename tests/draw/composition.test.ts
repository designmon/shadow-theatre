import { describe, expect, it } from 'vitest';
import { compositionArea, layout, zoneOf } from '../../src/draw/composition';
import { Clicker } from '../../src/ui/clicker';

const area = compositionArea({ w: 1920, h: 1080 });
const item = (label: string, h = 200) => ({ label, top: -h / 2, bottom: h / 2, left: -h / 2, right: h / 2 });

describe('composition', () => {
  it('lives on the side of the wall, leaving the rest for drawing', () => {
    expect(area.x).toBeGreaterThan(1920 * 0.5);
  });
  it('sky, ground and water', () => {
    expect(zoneOf('bird')).toBe('sky');
    expect(zoneOf('cat')).toBe('ground');
    expect(zoneOf('boat')).toBe('water');
  });
  it('ground things stand on the ground line, a tree taller than a cat, birds above them', () => {
    const items = [item('cat'), item('tree'), item('bird')];
    const { places, decor } = layout(items, area);
    const [cat, tree, bird] = places.map((p) => p!);
    expect(decor.groundY).not.toBeNull();
    expect(cat.at.y + 100 * cat.scale).toBeCloseTo(decor.groundY!); // feet on the line
    expect(tree.at.y + 100 * tree.scale).toBeCloseTo(decor.groundY!);
    expect(200 * tree.scale).toBeGreaterThan(200 * cat.scale);
    expect(bird.at.y).toBeLessThan(cat.at.y);
    expect(decor.farBirds.length).toBe(2); // the scene adds two far-off birds
  });
  it('a boat sits on the water line; nothing overlaps on the ground', () => {
    const { places, decor } = layout([item('boat'), item('dog'), item('flower'), item('house')], area);
    expect(decor.waterY).not.toBeNull();
    expect(places[0]!.at.y + 100 * places[0]!.scale).toBeCloseTo(decor.waterY! + area.h * 0.01);
    const xs = places.slice(1).map((p) => p!.at.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(area.w / 4);
    expect(decor.tufts.length).toBe(2); // grass by the flower and the house
  });
  it('too many in the sky: the oldest has no place (it fades away)', () => {
    const { places } = layout(Array.from({ length: 8 }, () => item('star')), area);
    expect(places.filter((p) => p === null).length).toBe(2);
    expect(places[0]).toBeNull();
  });
});

describe('a click with the hand (quick fist, then open)', () => {
  it('clicks where the fist was; a flicker, a long hold or a double flicker after a click does not', () => {
    const c = new Clicker(), at = { x: 300, y: 200 };
    expect(c.feed(at, true, 0)).toBeNull();
    expect(c.feed(at, true, 300)).toBeNull();
    expect(c.feed(at, false, 400)).toEqual(at); // click
    expect(c.feed(at, true, 500)).toBeNull();
    expect(c.feed(at, false, 700)).toBeNull(); // right after: ignored
    expect(c.feed(at, true, 2000)).toBeNull();
    expect(c.feed(at, false, 2050)).toBeNull(); // a flicker
    expect(c.feed(at, true, 3000)).toBeNull();
    expect(c.feed(at, false, 5000)).toBeNull(); // held too long
  });
});

