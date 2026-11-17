import { describe, expect, it } from 'vitest';
import { LaserPen } from '../../src/draw/pen';

const run = (pen: LaserPen, from: number, to: number, f: (t: number) => { x: number; y: number } | null) => {
  let last;
  for (let t = from; t <= to; t += 33) last = pen.update(f(t), t);
  return last!;
};

describe('LaserPen', () => {
  it('arms when the fingertip is held still, then shows the laser (with a burst)', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 500, () => ({ x: 500, y: 300 })).mode).toBe('arming');
    const s = run(pen, 533, 1400, () => ({ x: 500, y: 300 }));
    expect(s.mode).toBe('drawing');
    expect(s.cursor!.x).toBeCloseTo(500, 0);
    expect(pen.takeBursts().some((b) => b.kind === 'start')).toBe(true);
  });

  it('a hand that keeps moving does not start the pen', () => {
    const pen = new LaserPen();
    const s = run(pen, 0, 3000, (t) => ({ x: 300 + t * 0.2, y: 300 }));
    expect(s.mode).not.toBe('drawing');
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
    expect(pen.takeBursts().some((b) => b.kind === 'finish')).toBe(true);
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

describe('pulling the hand away (real-room: a long tail drawn as the finger leaves)', () => {
  it('drops the quick retreat at the end of the drawing', () => {
    const pen = new LaserPen();
    run(pen, 0, 1300, () => ({ x: 500, y: 300 }));
    // draw a slow arc to the right
    run(pen, 1333, 3333, (t) => ({ x: 500 + (t - 1333) * 0.15, y: 300 + Math.sin((t - 1333) / 300) * 40 }));
    // then the hand is pulled out: the tip shoots back left for ~250 ms, then it's gone
    run(pen, 3366, 3600, (t) => ({ x: 800 - (t - 3366) * 2, y: 300 }));
    run(pen, 3633, 4400, () => null);
    const s = pen.takeFinished()!;
    expect(Math.min(...s.map((p) => p.x))).toBeGreaterThan(480); // no tail back to the left
    expect(Math.max(...s.map((p) => p.x))).toBeGreaterThan(760);
  });
});

describe('pulling the hand away slowly', () => {
  it('drops a slow slide back along the finger when the hand leaves', () => {
    const pen = new LaserPen();
    const dir = { x: 1, y: 0 }; // the finger points right
    for (let t = 0; t <= 1300; t += 33) pen.update({ x: 500, y: 300 }, t, dir);
    for (let t = 1333; t <= 3333; t += 33) pen.update({ x: 500 + (t - 1333) * 0.15, y: 300 + Math.sin((t - 1333) / 300) * 40 }, t, dir);
    for (let t = 3366; t <= 4400; t += 33) pen.update({ x: 800 - (t - 3366) * 0.4, y: 300 }, t, dir); // slow slide back left
    for (let t = 4433; t <= 5200; t += 33) pen.update(null, t);
    const s = pen.takeFinished()!;
    expect(Math.min(...s.map((p) => p.x))).toBeGreaterThan(480);
  });
});
