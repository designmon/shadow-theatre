import { describe, expect, it } from 'vitest';
import { LaserPen, type PenInput } from '../../src/draw/pen';

type Pose = PenInput['pose'];
const run = (pen: LaserPen, from: number, to: number, f: (t: number) => { x: number; y: number } | null, pose: Pose = 'point', dir = { x: 1, y: 0 }) => {
  let last;
  for (let t = from; t <= to; t += 33) { const tip = f(t); last = pen.update(tip ? { tip, pose, dir } : null, t); }
  return last!;
};
const arc = (t0: number, x0: number) => (t: number) => ({ x: x0 + (t - t0) * 0.15, y: 300 + Math.sin((t - t0) / 300) * 40 });

describe('LaserPen: one line, drawn by the fingertip alone', () => {
  it('pointing and resting a moment turns the pen on (with a burst)', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 200, () => ({ x: 500, y: 300 })).mode).toBe('arming');
    expect(run(pen, 233, 600, () => ({ x: 500, y: 300 })).mode).toBe('down');
    expect(pen.takeBursts().some((b) => b.kind === 'start')).toBe(true);
  });
  it('reaching in while pointing does not draw from the edge: the pen waits until the finger rests', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 900, (t) => ({ x: 100 + t * 0.4, y: 300 })).mode).toBe('arming');
    expect(run(pen, 933, 1400, () => ({ x: 470, y: 300 })).mode).toBe('down');
  });
  it('an open hand or a fist never turns the pen on', () => {
    const pen = new LaserPen();
    expect(run(pen, 0, 1000, () => ({ x: 500, y: 300 }), 'open').mode).toBe('idle');
    expect(run(pen, 1033, 2000, () => ({ x: 500, y: 300 }), 'fist').mode).toBe('idle');
  });
  it('draws one line while pointing', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    const s = run(pen, 633, 2000, arc(633, 500));
    expect(s.strokes.length).toBe(1);
    expect(s.strokes[0].length).toBeGreaterThan(20);
  });
  it('the fingertip hidden over the hand\'s own shadow: the pen waits (no jump, no ink), then carries on — still one line', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1500, arc(633, 500));
    const before = run(pen, 1533, 1533, arc(633, 500));
    const n = before.strokes[0].length, cur = { ...before.cursor! };
    const hidden = run(pen, 1566, 2400, () => ({ x: 380, y: 420 }), 'open'); // "tip" now somewhere on the palm
    expect(hidden.mode).toBe('down');
    expect(hidden.strokes[0].length).toBe(n); // no ink while hidden
    expect(Math.hypot(hidden.cursor!.x - cur.x, hidden.cursor!.y - cur.y)).toBeLessThan(1); // and no jump
    const after = run(pen, 2433, 3000, arc(1500, 640));
    expect(after.strokes.length).toBe(1);
    expect(after.strokes[0].length).toBeGreaterThan(n);
  });
  it('resting, or drawing slowly, never ends the drawing (no timer)', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 2000, arc(633, 500));
    const s = run(pen, 2033, 7000, () => ({ x: 705, y: 310 })); // five seconds of thinking
    expect(s.mode).toBe('down');
    expect(s.finish).toBe(0);
  });
  it('a fist finishes the drawing quickly, once, with a burst', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 2000, arc(633, 500));
    expect(run(pen, 2033, 2133, () => ({ x: 700, y: 310 }), 'fist').mode).toBe('down'); // a flicker isn't enough
    const s = run(pen, 2166, 2333, () => ({ x: 700, y: 310 }), 'fist');
    expect(s.mode).toBe('idle'); // a third of a second after closing the hand
    const done = pen.takeFinished()!;
    expect(done.length).toBe(1);
    expect(done[0].length).toBeGreaterThan(10);
    expect(pen.takeFinished()).toBeNull();
    expect(pen.takeBursts().some((b) => b.kind === 'finish')).toBe(true);
  });
  it('a small circle (an eye) is drawn as a small circle, and survives the clean-up', async () => {
    const { refineStroke } = await import('../../src/draw/refine');
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1500, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 })); // a line to where the eye goes
    const cx = 673, cy = 285, r = 15;
    const s = run(pen, 1533, 3000, (t) => { const a = ((t - 1533) / 1400) * Math.PI * 2 + Math.PI / 2; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
    const eye = s.strokes[0].filter((p) => p.x > 650);
    const w = Math.max(...eye.map((p) => p.x)) - Math.min(...eye.map((p) => p.x)), h = Math.max(...eye.map((p) => p.y)) - Math.min(...eye.map((p) => p.y));
    expect(w).toBeGreaterThan(20); // 30 px drawn
    expect(h).toBeGreaterThan(20);
    const refined = refineStroke(s.strokes[0]).points.filter((p) => p.x > 655);
    expect(Math.max(...refined.map((p) => p.y)) - Math.min(...refined.map((p) => p.y))).toBeGreaterThan(18);
  });
  it('pulling the hand out of the light also finishes, without the slide back along the finger', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 2000, arc(633, 500));
    run(pen, 2033, 2300, (t) => ({ x: 700 - (t - 2033) * 1.5, y: 300 }), 'point', { x: 1, y: 0 }); // retreating fast
    run(pen, 2333, 3400, () => null);
    const done = pen.takeFinished()!;
    expect(Math.max(...done[0].map((p) => p.x))).toBeGreaterThan(680);
    expect(done[0][done[0].length - 1].x).toBeGreaterThan(600);
  });
  it('ignores a one-frame jump across the wall', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 500, y: 300 }));
    run(pen, 633, 1300, arc(633, 500));
    const s = run(pen, 1333, 1333, () => ({ x: 1500, y: 900 }));
    expect(Math.max(...s.strokes[0].map((p) => p.x))).toBeLessThan(700);
  });
  it('a shaky fingertip draws a steady line (lazy brush)', () => {
    const pen = new LaserPen();
    run(pen, 0, 600, () => ({ x: 400, y: 300 }));
    let k = 0;
    const shaky = (t: number) => ({ x: 400 + (t - 633) * 0.3, y: 300 + ((k++ * 7919) % 13) - 6 }); // ±6 px tremor
    const s = run(pen, 633, 2600, shaky);
    const ys = s.strokes[0].slice(3).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(5);
    expect(Math.max(...s.strokes[0].map((p) => p.x))).toBeGreaterThan(900);
  });
  it('ink drawn while the fingertip is hidden is kept when the finger shows again, dropped if the drawing ends first', () => {
    const feed = (pen: LaserPen, from: number, to: number, f: (t: number) => { x: number; y: number }, guess: boolean, pose: Pose = 'point') => { let last; for (let t = from; t <= to; t += 33) last = pen.update({ tip: f(t), pose, guess }, t); return last!; };
    // hidden for a while, then seen again: one line, all of it
    const a = new LaserPen();
    run(a, 0, 600, () => ({ x: 500, y: 300 }));
    feed(a, 633, 1500, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 }), false);
    feed(a, 1533, 2200, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 }), true);
    feed(a, 2233, 2800, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 }), false);
    feed(a, 2833, 3200, () => ({ x: 930, y: 300 }), false, 'fist');
    expect(Math.max(...a.takeFinished()![0].map((p) => p.x))).toBeGreaterThan(900);
    // hidden, and then the hand closes and leaves: the hidden part was never drawing
    const b = new LaserPen();
    run(b, 0, 600, () => ({ x: 500, y: 300 }));
    feed(b, 633, 1500, (t) => ({ x: 500 + (t - 633) * 0.2, y: 300 }), false);
    feed(b, 1533, 2200, (t) => ({ x: 673 - (t - 1533) * 0.5, y: 300 }), true); // the fist being pulled away
    run(b, 2233, 3400, () => null);
    const done = b.takeFinished()![0];
    expect(Math.min(...done.map((p) => p.x))).toBeGreaterThan(490);
    expect(done[done.length - 1].x).toBeGreaterThan(640);
  });
});
