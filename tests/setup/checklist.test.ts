import { describe, expect, it } from 'vitest';
import { Checklist } from '../../src/setup/checklist';

describe('setup checklist', () => {
  it('starts with everything pending and not ready', () => {
    const c = new Checklist();
    expect(c.items().map((i) => i.state)).toEqual(['pending', 'pending', 'pending', 'pending']);
    expect(c.ready).toBe(false);
  });

  it('shows what each step reports', () => {
    const c = new Checklist();
    c.camera('ok', 'iPhone camera');
    c.wall('fail', 'Could not see the 4 squares');
    const [cam, wall] = c.items();
    expect(cam).toMatchObject({ key: 'camera', state: 'ok', detail: 'iPhone camera' });
    expect(wall).toMatchObject({ key: 'wall', state: 'fail', detail: 'Could not see the 4 squares' });
  });

  it('is ready when all four are ok, and hides itself 2 s later', () => {
    const c = new Checklist();
    c.camera('ok', 'cam'); c.wall('ok', '4 squares found'); c.server('ok', 'Claude replied');
    expect(c.ready).toBe(false);
    c.shadow('ok', 'seen', 1000);
    expect(c.ready).toBe(true);
    expect(c.shouldAutoHide(2500)).toBe(false);
    expect(c.shouldAutoHide(3000)).toBe(true);
  });

  it('a step going bad again cancels the auto-hide', () => {
    const c = new Checklist();
    c.camera('ok', 'cam'); c.wall('ok', 'ok'); c.server('ok', 'ok'); c.shadow('ok', 'seen', 0);
    c.wall('fail', 'projector moved', 1500);
    expect(c.shouldAutoHide(5000)).toBe(false);
  });

  it('a new calibration resets the shadow check', () => {
    const c = new Checklist();
    c.shadow('ok', 'seen', 0);
    c.wall('ok', '4 squares found', 100);
    expect(c.items()[3].state).toBe('pending');
  });
});
