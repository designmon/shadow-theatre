import { describe, expect, it } from 'vitest';
import { LaserPen } from '../../src/draw/pen';

const run = (pen: LaserPen, from: number, to: number, f: (t: number) => { x: number; y: number } | null) => {
  let last;
  for (let t = from; t <= to; t += 33) last = pen.update(f(t), t);
  return last!;
};

describe('LaserPen', () => {
  it('arms after holding a pointing finger, then shows the laser', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 600, () => ({ x: 500, y: 300 })).mode).toBe('arming');
    const s = run(pen, 633, 1400, () => ({ x: 500, y: 300 }));
    expect(s.mode).toBe('drawing');
    expect(s.cursor).toEqual({ x: 500, y: 300 });
  });

  it('draws a smooth line following the fingertip', () => {
    const pen = new LaserPen();
    run(pen, 0, 1300, () => ({ x: 500, y: 300 }));
    const s = run(pen, 1333, 3000, (t) => ({ x: 500 + (t - 1333) * 0.3 + (Math.round(t / 33) % 2) * 3, y: 300 }));
    expect(s.stroke.length).toBeGreaterThan(20);
    // jitter is smoothed: y stays near 300, x keeps increasing
    expect(Math.max(...s.stroke.map((p) => Math.abs(p.y - 300)))).toBeLessThan(2);
    expect(s.stroke.at(-1)!.x).toBeGreaterThan(s.stroke[0].x + 300);
  });

  it('finishes when the finger is pulled away, handing over the drawing once', () => {
    const pen = new LaserPen();
    run(pen, 0, 1300, () => ({ x: 500, y: 300 }));
    run(pen, 1333, 2500, (t) => ({ x: 500 + (t - 1333) * 0.3, y: 300 + Math.sin(t / 200) * 60 }));
    const done = run(pen, 2533, 3400, () => null);
    expect(done.mode).toBe('idle');
    const finished = pen.takeFinished();
    expect(finished!.length).toBeGreaterThan(10);
    expect(pen.takeFinished()).toBeNull();
  });

  it('finishes when the fingertip is held still after drawing', () => {
    const pen = new LaserPen();
    run(pen, 0, 1300, () => ({ x: 500, y: 300 }));
    run(pen, 1333, 2500, (t) => ({ x: 500 + (t - 1333) * 0.4, y: 300 }));
    run(pen, 2533, 4300, () => ({ x: 966, y: 300 }));
    expect(pen.takeFinished()).not.toBeNull();
  });

  it('a short wobble without drawing anything is not a drawing', () => {
    const pen = new LaserPen();
    run(pen, 0, 1300, () => ({ x: 500, y: 300 }));
    run(pen, 1333, 2400, () => null);
    expect(pen.takeFinished()).toBeNull();
  });
});
