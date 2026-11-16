import { afterEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/calibration/watch';

afterEach(() => vi.useRealTimers());
describe('review I3: recalibrate after resize/fullscreen', () => {
  it('debounce runs once after the burst settles', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 600);
    d(); d(); vi.advanceTimersByTime(300); d();
    vi.advanceTimersByTime(599);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
