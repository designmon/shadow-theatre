import { describe, expect, it } from 'vitest';
import { applyH, solveHomography } from '../../src/calibration/homography';
import { solveCalibration } from '../../src/calibration/calibrate';
import { gray } from '../helpers';
import type { Gray, Pt } from '../../src/types';

const PW = 1000, PH = 600;
const projCorners = [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }];
const camQuad = [{ x: 60, y: 40 }, { x: 270, y: 50 }, { x: 260, y: 200 }, { x: 70, y: 190 }];
const projToCam = solveHomography(projCorners, camQuad);
const camToProj = solveHomography(camQuad, projCorners);

/** camera frame: room at `room`, projected picture at `wall`, squares (projector px) brighter. */
function render(room: number, wall: number, squares: Pt[] = [], sq = 40): Gray {
  const g = gray(320, 240, room);
  for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
    const p = applyH(camToProj, { x: x + 0.5, y: y + 0.5 });
    if (p.x < 0 || p.y < 0 || p.x >= PW || p.y >= PH) continue;
    const onSquare = squares.some((c) => Math.abs(p.x - c.x) <= sq && Math.abs(p.y - c.y) <= sq);
    g.data[y * 320 + x] = squares.length ? (onSquare ? wall : room) : wall;
  }
  return g;
}
const centers = [{ x: 120, y: 72 }, { x: 880, y: 72 }, { x: 880, y: 528 }, { x: 120, y: 528 }];
const close = (h: number[], tol: number) =>
  projCorners.every((p, i) => { const q = applyH(h, p); return Math.hypot(q.x - camQuad[i].x, q.y - camQuad[i].y) < tol; });

describe('solveCalibration', () => {
  it('uses the squares when they agree with the bright picture', () => {
    const r = solveCalibration(render(30, 30), render(30, 200, centers), render(30, 200), centers, PW, PH);
    expect(close(r.projToCam, 3)).toBe(true);
  });

  it('falls back to the corners of the bright picture when the squares are missing (dim, low contrast)', () => {
    const r = solveCalibration(render(60, 60), render(60, 60), render(60, 120), centers, PW, PH);
    expect(r.method).toBe('picture');
    expect(close(r.projToCam, 4)).toBe(true);
  });

  it('refuses a calibration that disagrees with the bright picture (stray bright spots taken as squares)', () => {
    const lit = render(30, 30);
    for (const [x, y] of [[5, 5], [300, 8], [305, 230], [8, 228]]) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) lit.data[(y + j) * 320 + x + i] = 220;
    // the picture itself is not visible in the white frame either (projector off / covered)
    expect(() => solveCalibration(render(30, 30), lit, render(30, 32), centers, PW, PH)).toThrow();
  });
});

import { patternCenters } from '../../src/calibration/pattern';
describe('picture edges outside the camera view', () => {
  it('pattern squares can sit further inside the picture', () => {
    const c = patternCenters(1000, 600, 0.28)[0];
    expect(c.x).toBeCloseTo(280);
    expect(c.y).toBeCloseTo(168);
  });

  it('calibrates from inner squares when the left part of the picture is cut off', () => {
    // camera sees the picture shifted left: its left ~20% falls outside the frame
    const quad = [{ x: -50, y: 40 }, { x: 250, y: 50 }, { x: 240, y: 200 }, { x: -40, y: 190 }];
    const c2p = solveHomography(quad, projCorners), p2c = solveHomography(projCorners, quad);
    const draw = (room: number, wall: number, squares: Pt[] = []) => {
      const g = gray(320, 240, room);
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
        const p = applyH(c2p, { x: x + 0.5, y: y + 0.5 });
        if (p.x < 0 || p.y < 0 || p.x >= PW || p.y >= PH) continue;
        const on = squares.some((c) => Math.abs(p.x - c.x) <= 40 && Math.abs(p.y - c.y) <= 40);
        g.data[y * 320 + x] = squares.length ? (on ? wall : room) : wall;
      }
      return g;
    };
    const inner = patternCenters(PW, PH, 0.28);
    const r = solveCalibration(draw(30, 30), draw(30, 200, inner), draw(30, 200), inner, PW, PH);
    expect(r.method).toBe('squares');
    projCorners.forEach((p, i) => {
      const q = applyH(r.projToCam, p);
      expect(Math.hypot(q.x - applyH(p2c, p).x, q.y - applyH(p2c, p).y)).toBeLessThan(4);
      void quad[i];
    });
  });
});

describe('never trust picture corners that are cut off by the camera frame', () => {
  it('refuses (so the inner squares get a try) when the picture runs off the camera view', () => {
    const quad = [{ x: -50, y: 40 }, { x: 250, y: 50 }, { x: 240, y: 200 }, { x: -40, y: 190 }];
    const c2p = solveHomography(quad, projCorners);
    const draw = (room: number, wall: number) => {
      const g = gray(320, 240, room);
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
        const p = applyH(c2p, { x: x + 0.5, y: y + 0.5 });
        if (p.x >= 0 && p.y >= 0 && p.x < PW && p.y < PH) g.data[y * 320 + x] = wall;
      }
      return g;
    };
    // outer squares: the left two are outside the camera view, so no squares solution either
    expect(() => solveCalibration(draw(30, 30), draw(30, 30), draw(30, 200), centers, PW, PH)).toThrow();
  });
});

import { calibrationWarning } from '../../src/calibration/calibrate';
import { fillRect, mask } from '../helpers';
describe('calibrationWarning', () => {
  it('warns when part of the wall was dark during calibration (someone in the light)', () => {
    const wall = fillRect(mask(320, 240), 50, 40, 200, 150, 1);
    const lit = fillRect(fillRect(mask(320, 240), 50, 40, 200, 150, 1), 60, 60, 50, 120, 0);
    expect(calibrationWarning(wall, lit)).toMatch(/step out/i);
  });
  it('is quiet when the whole wall lit up', () => {
    const wall = fillRect(mask(320, 240), 50, 40, 200, 150, 1);
    expect(calibrationWarning(wall, wall)).toBeNull();
  });
});

describe('a lamp in one corner (real-room report: "only saw 4 of the 4 squares")', () => {
  // the lamp-lit corner: projector adds little there (camera near its maximum)
  const lampCorner = (g: Gray, add: number) => {
    for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) if (x > 170 && y > 120) g.data[y * 320 + x] = Math.min(255, g.data[y * 320 + x] + add);
    return g;
  };
  it('accepts correct squares even when the lamp corner barely lights up in the white picture', () => {
    const dark = lampCorner(render(30, 30), 190);
    const pattern = lampCorner(render(30, 200, centers), 190);
    const white = lampCorner(render(30, 200), 190);
    const r = solveCalibration(dark, pattern, white, centers, PW, PH);
    expect(r.method).toBe('squares');
    expect(close(r.projToCam, 3)).toBe(true);
  });
  it('finds a faint square in the lamp corner', () => {
    const dark = lampCorner(render(30, 30), 150);
    const pattern = lampCorner(render(30, 200, centers), 150);
    const white = lampCorner(render(30, 200), 150);
    expect(solveCalibration(dark, pattern, white, centers, PW, PH).method).toBe('squares');
  });
});

describe('honest failure messages', () => {
  it('says the squares did not line up, not "saw 4 of 4"', async () => {
    const { CalibrationError } = await import('../../src/calibration/calibrate');
    expect(new CalibrationError(4, gray(1, 1), mask(1, 1)).message).not.toMatch(/4 of the 4/);
  });
});
