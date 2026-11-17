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
