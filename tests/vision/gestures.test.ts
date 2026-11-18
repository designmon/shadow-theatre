import { describe, expect, it } from 'vitest';
import { StopSign, WaveDetector } from '../../src/vision/gestures';

describe('hand gestures for voice', () => {
  it('a wave (open hand, side to side a few times) is seen once; moving across once is not a wave', () => {
    const w = new WaveDetector();
    let seen = 0;
    for (let t = 0; t < 1500; t += 33) if (w.feed({ x: 600 + Math.sin(t / 120) * 80, y: 400 }, true, t)) seen++;
    expect(seen).toBe(1);
    const w2 = new WaveDetector();
    let crossed = false;
    for (let t = 0; t < 1500; t += 33) crossed ||= w2.feed({ x: 200 + t * 0.6, y: 400 }, true, t);
    expect(crossed).toBe(false);
    const w3 = new WaveDetector(); // pointing (drawing) never waves
    let drew = false;
    for (let t = 0; t < 1500; t += 33) drew ||= w3.feed({ x: 600 + Math.sin(t / 120) * 80, y: 400 }, false, t);
    expect(drew).toBe(false);
  });
  it('a stop sign: an open palm held still — but only after the hand dropped once since the wave', () => {
    const s = new StopSign();
    s.reset();
    let stopped = false;
    for (let t = 0; t < 1500; t += 33) stopped ||= s.feed({ x: 600, y: 400 }, true, t); // still waving hand, held up
    expect(stopped).toBe(false);
    s.feed(null, false, 1600); // hand drops
    for (let t = 1700; t < 2400; t += 33) stopped ||= s.feed({ x: 640, y: 380 }, true, t);
    expect(stopped).toBe(false); // not long enough yet
    for (let t = 2433; t < 2700; t += 33) stopped ||= s.feed({ x: 642, y: 382 }, true, t);
    expect(stopped).toBe(true);
  });
});
