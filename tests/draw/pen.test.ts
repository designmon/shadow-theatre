import { describe, expect, it } from 'vitest';
import { LaserPen, type PenInput } from '../../src/draw/pen';

type Pose = PenInput['pose'];
const run = (pen: LaserPen, from: number, to: number, f: (t: number) => { x: number; y: number } | null, pose: Pose = 'point', dir = { x: 1, y: 0 }) => {
  let last;
  for (let t = from; t <= to; t += 33) { const tip = f(t); last = pen.update(tip ? { tip, pose, dir } : null, t); }
  return last!;
};
const arc = (t0: number, x0: number) => (t: number) => ({ x: x0 + (t - t0) * 0.15, y: 300 + Math.sin((t - t0) / 300) * 40 });

describe('LaserPen with gestures', () => {
  it('pointing for a moment turns the pen on (with a burst)', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 200, () => ({ x: 500, y: 300 })).mode).toBe('arming');
    const s = run(pen, 233, 600, () => ({ x: 500, y: 300 }));
    expect(s.mode).toBe('down');
    expect(pen.takeBursts().some((b) => b.kind === 'start')).toBe(true);
  });

  it('reaching in while pointing does not draw from the edge: the pen waits until the finger rests', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 900, (t) => ({ x: 100 + t * 0.4, y: 300 })).mode).toBe('arming'); // sweeping in
    expect(run(pen, 933, 1400, () => ({ x: 470, y: 300 })).mode).toBe('down'); // stops: pen on, right there
    expect(pen.update({ tip: { x: 470, y: 300 }, pose: 'point' }, 1433).strokes[0][0].x).toBeGreaterThan(440);
  });
  it('an open hand or fist never turns the pen on', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 2000, () => ({ x: 500, y: 300 }), 'open').mode).toBe('idle');
    expect(run(pen, 2033, 4000, () => ({ x: 500, y: 300 }), 'fist').mode).toBe('idle');
  });

  it('draws a smooth line while pointing', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    const s = run(pen, 633, 2300, (t) => ({ x: 500 + (t - 633) * 0.3 + (Math.round(t / 33) % 2) * 3, y: 300 }));
    const line = s.strokes.at(-1)!;
    expect(line.length).toBeGreaterThan(20);
    expect(Math.max(...line.map((p) => Math.abs(p.y - 300)))).toBeLessThan(2);
  });

  it('an open hand lifts the pen; pointing again starts a new stroke', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1600, arc(633, 500));
    expect(run(pen, 1633, 2200, (t) => ({ x: 700, y: 200 + (t - 1633) * 0.2 }), 'open').mode).toBe('up');
    const s = run(pen, 2233, 3200, arc(2233, 700));
    expect(s.strokes.length).toBe(2);
    expect(s.strokes[1][0].x).toBeGreaterThan(650); // no ink where the hand moved while open
  });

  it('a fist finishes the drawing and hands it over once, with a burst', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 2000, arc(633, 500));
    const s = run(pen, 2033, 2700, () => ({ x: 700, y: 310 }), 'fist');
    expect(s.mode).toBe('idle');
    const done = pen.takeFinished()!;
    expect(done.length).toBe(1);
    expect(done[0].length).toBeGreaterThan(10);
    expect(pen.takeFinished()).toBeNull();
    expect(pen.takeBursts().some((b) => b.kind === 'finish')).toBe(true);
  });

  it('pulling the hand out of the light also finishes, without the slide back along the finger', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 2633, arc(633, 500));
    run(pen, 2666, 3600, (t) => ({ x: 800 - (t - 2666) * 0.4, y: 300 })); // slides back along the finger
    run(pen, 3633, 4600, () => null);
    const done = pen.takeFinished()!;
    expect(Math.min(...done.flat().map((p) => p.x))).toBeGreaterThan(480);
  });

  it('ignores a one-frame jump across the wall', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1600, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 }));
    pen.update({ tip: { x: 1500, y: 900 }, pose: 'point', dir: { x: 1, y: 0 } }, 1633);
    const s = pen.update({ tip: { x: 696, y: 300 }, pose: 'point', dir: { x: 1, y: 0 } }, 1666);
    expect(Math.max(...s.strokes.flat().map((p) => p.x))).toBeLessThan(800);
  });

  it('a brief wobble of the pose does not lift the pen', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1300, arc(633, 500));
    run(pen, 1333, 1366, arc(633, 500), 'open'); // two frames
    const s = run(pen, 1399, 2000, arc(633, 500));
    expect(s.strokes.length).toBe(1);
  });
  it('a pose that flickers between point and open while drawing does not break the line', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    for (let t0 = 633; t0 < 2600; t0 += 400) {
      run(pen, t0, t0 + 180, arc(633, 500), 'point');
      run(pen, t0 + 200, t0 + 380, arc(633, 500), 'open'); // ~200 ms of "open" at a time
    }
    expect(pen.update({ tip: arc(633, 500)(2633), pose: 'point' }, 2633).strokes.length).toBe(1);
  });
});
