import { describe, expect, it } from 'vitest';
import { MisalignmentWatch } from '../../src/calibration/watch';

describe('review I5/I6: MisalignmentWatch', () => {
  it('needs a full second of disagreement, not a number of frames', () => {
    const w = new MisalignmentWatch();
    let fired = false;
    for (let t = 0; t < 900; t += 16) fired ||= w.push(0.2, t);
    expect(fired).toBe(false);
    expect(w.push(0.2, 1001)).toBe(true);
  });
  it('a good score or no data resets the clock', () => {
    const w = new MisalignmentWatch();
    for (let t = 0; t < 900; t += 16) w.push(0.2, t);
    w.push(null, 910);
    expect(w.push(0.2, 1200)).toBe(false);
  });
  it('backs off for 10 s after a failed recalibration', () => {
    const w = new MisalignmentWatch();
    w.failed(0);
    let fired = false;
    for (let t = 0; t < 9500; t += 16) fired ||= w.push(0.1, t);
    expect(fired).toBe(false);
    for (let t = 10000; t < 11100; t += 16) fired ||= w.push(0.1, t);
    expect(fired).toBe(true);
  });
});
