import { describe, expect, it } from 'vitest';
import { OneEuro2D } from '../../src/draw/oneEuro';
import { refineStroke } from '../../src/draw/refine';

const jitter = (i: number) => ((i * 7919) % 13) - 6; // deterministic ±6 px wobble

describe('OneEuro2D (live smoothing of a shaky fingertip)', () => {
  it('steadies a fingertip held still', () => {
    const f = new OneEuro2D();
    let maxDev = 0;
    for (let i = 0; i < 90; i++) {
      const p = f.filter({ x: 500 + jitter(i), y: 300 + jitter(i + 3) }, i * 33);
      if (i > 20) maxDev = Math.max(maxDev, Math.abs(p.x - 500), Math.abs(p.y - 300));
    }
    expect(maxDev).toBeLessThan(2.5);
  });
  it('keeps up with a fast stroke', () => {
    const f = new OneEuro2D();
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 40; i++) p = f.filter({ x: i * 25, y: 300 }, i * 33); // ~750 px/s
    expect(39 * 25 - p.x).toBeLessThan(40); // lags less than ~1.5 frames of movement
  });
});

describe('refineStroke (the line settles when you finish)', () => {
  const wobblyLine = Array.from({ length: 80 }, (_, i) => ({ x: 100 + i * 6, y: 300 + jitter(i) }));
  const roughness = (pts: { x: number; y: number }[]) => {
    let s = 0;
    for (let i = 1; i < pts.length - 1; i++) s += Math.abs(pts[i + 1].y - 2 * pts[i].y + pts[i - 1].y);
    return s / pts.length;
  };
  it('turns a wobbly line into a smooth one that follows the same path', () => {
    const r = refineStroke(wobblyLine);
    expect(roughness(r.points)).toBeLessThan(roughness(wobblyLine) / 4);
    expect(r.points[0].x).toBeCloseTo(100, -1);
    expect(r.points.at(-1)!.x).toBeCloseTo(574, -1);
    expect(r.closed).toBe(false);
  });
  it('closes a loop whose end comes back near the start', () => {
    const loop = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 1.95;
      return { x: 500 + Math.cos(a) * 100 + jitter(i) * 0.5, y: 400 + Math.sin(a) * 100 };
    });
    const r = refineStroke(loop);
    expect(r.closed).toBe(true);
  });
});

describe('refineStroke on a loop that ends exactly where it started', () => {
  it('keeps the whole shape (a drawn circle must not collapse)', () => {
    const circle = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 59) * Math.PI * 2;
      return { x: 900 + Math.cos(a) * 120, y: 500 + Math.sin(a) * 50 };
    });
    const r = refineStroke(circle);
    expect(r.closed).toBe(true);
    const xs = r.points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200);
  });
});
