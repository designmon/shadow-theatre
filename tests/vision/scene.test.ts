import { describe, expect, it } from 'vitest';
import { findBlobs } from '../../src/vision/blobs';
import { analyzeScene } from '../../src/vision/scene';
import { fillRect, mask } from '../helpers';

const W = 320, H = 240;
const scene = (m: ReturnType<typeof mask>) => analyzeScene(m, findBlobs(m));

describe('analyzeScene', () => {
  it('returns null with no shadow', () => {
    expect(scene(mask(W, H))).toBeNull();
  });

  it('arm from the left: open side is right', () => {
    const m = mask(W, H);
    fillRect(m, 0, 60, 50, 180, 1);   // body against the left edge
    fillRect(m, 50, 110, 150, 12, 1); // arm
    fillRect(m, 190, 95, 30, 30, 1);  // hand
    const s = scene(m)!;
    expect(s.entry).toBe('left');
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(110); // tip window = 30% of frame width (96px) back from the fingertips
    expect(s.puppetBox.x + s.puppetBox.w).toBe(220);
    expect(s.puppetBox.y).toBeLessThanOrEqual(95);
    expect(s.bodyBox!.x).toBe(0);
  });

  it('arm from the bottom: open side is up', () => {
    const m = mask(W, H);
    fillRect(m, 140, 150, 14, 90, 1); // forearm from bottom edge
    fillRect(m, 130, 120, 36, 30, 1); // hand
    const s = scene(m)!;
    expect(s.entry).toBe('down');
    expect(s.openSide).toBe('up');
    expect(s.puppetBox.y).toBe(120);
  });

  it('free-floating blob picks the emptiest side', () => {
    const m = fillRect(mask(W, H), 20, 100, 60, 40, 1);
    const s = scene(m)!;
    expect(s.entry).toBeNull();
    expect(s.openSide).toBe('right');
    expect(s.bodyBox).toBeNull();
    expect(s.puppetBox).toEqual({ x: 20, y: 100, w: 60, h: 40 });
  });
});

describe('analyzeScene with a lit-wall mask', () => {
  it('entry is measured against the lit wall edge, not the camera frame', () => {
    const lit = fillRect(mask(W, H), 30, 20, 260, 200, 1); // wall seen inside a dark border
    const m = mask(W, H);
    fillRect(m, 30, 60, 40, 160, 1);  // body against the wall's left edge
    fillRect(m, 70, 110, 120, 12, 1); // arm
    fillRect(m, 180, 95, 30, 30, 1);  // hand
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.entry).toBe('left');
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(110);
    expect(s.bodyBox!.x).toBe(30);
  });
});

describe('analyzeScene: body standing on the bottom edge', () => {
  it('arm reaching right from a body that touches the bottom: open right, puppet is the hand', () => {
    const lit = fillRect(mask(W, H), 20, 20, 280, 200, 1);
    const m = mask(W, H);
    fillRect(m, 40, 90, 50, 130, 1);  // body, touches only the bottom of the lit wall
    fillRect(m, 90, 110, 120, 12, 1); // arm
    fillRect(m, 200, 95, 30, 30, 1);  // hand
    const s = analyzeScene(m, findBlobs(m), lit)!;
    expect(s.openSide).toBe('right');
    expect(s.puppetBox.x).toBeGreaterThanOrEqual(120);
    expect(s.puppetBox.x + s.puppetBox.w).toBe(230);
    expect(s.puppetBox.y).toBeLessThanOrEqual(95);
  });
});
