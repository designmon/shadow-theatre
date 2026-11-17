import { describe, expect, it } from 'vitest';
import { applyH, solveHomography } from '../../src/calibration/homography';
import { findMarkers } from '../../src/calibration/pattern';
import { gray } from '../helpers';
import type { Gray, Pt } from '../../src/types';

// Render squares (in "projector" space) through a mild perspective into a 320x240 camera frame.
function renderLit(centers: Pt[], projToCam: number[]): Gray {
  const g = gray(320, 240, 25);
  const camToProj = solveHomography(
    [0, 1, 2, 3].map((i) => applyH(projToCam, [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }][i])),
    [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
  );
  for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) {
    const p = applyH(camToProj, { x: x + 0.5, y: y + 0.5 });
    if (centers.some((c) => Math.abs(p.x - c.x) <= 30 && Math.abs(p.y - c.y) <= 30)) g.data[y * 320 + x] = 230;
  }
  return g;
}

const projToCam = solveHomography(
  [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }],
  [{ x: 20, y: 15 }, { x: 300, y: 25 }, { x: 290, y: 225 }, { x: 30, y: 210 }],
);
const centers = [{ x: 120, y: 72 }, { x: 880, y: 72 }, { x: 880, y: 528 }, { x: 120, y: 528 }];

describe('findMarkers', () => {
  it('finds four squares in order', () => {
    const got = findMarkers(renderLit(centers, projToCam), gray(320, 240, 25));
    expect(got).not.toBeNull();
    got!.forEach((p, i) => {
      const want = applyH(projToCam, centers[i]);
      expect(Math.hypot(p.x - want.x, p.y - want.y)).toBeLessThan(1.5);
    });
  });

  it('returns null with 3 squares', () => {
    expect(findMarkers(renderLit(centers.slice(0, 3), projToCam), gray(320, 240, 25))).toBeNull();
  });
});

import { findMarkersDetailed } from '../../src/calibration/pattern';
import { fillRect } from '../helpers';

describe('findMarkers in a real room', () => {
  it('ignores a bigger stray bright spot (lamp reflection)', () => {
    const lit = renderLit(centers, projToCam);
    fillRect(lit, 140, 100, 40, 30, 240); // big bright patch in the middle that changed between frames
    const got = findMarkers(lit, gray(320, 240, 25));
    expect(got).not.toBeNull();
    got!.forEach((p, i) => {
      const want = applyH(projToCam, centers[i]);
      expect(Math.hypot(p.x - want.x, p.y - want.y)).toBeLessThan(1.5);
    });
  });

  it('finds small squares when the picture is small in the camera view', () => {
    const lit = gray(320, 240, 25);
    for (const [x, y] of [[120, 90], [200, 90], [200, 150], [120, 150]]) fillRect(lit, x, y, 3, 3, 200);
    expect(findMarkers(lit, gray(320, 240, 25))).not.toBeNull();
  });

  it('works with a weak but clear difference (dim projector)', () => {
    const lit = gray(320, 240, 60);
    for (const [x, y] of [[40, 40], [270, 40], [270, 190], [40, 190]]) fillRect(lit, x, y, 10, 10, 80);
    expect(findMarkers(lit, gray(320, 240, 60))).not.toBeNull();
  });

  it('reports how many squares it saw, and the picture of what changed', () => {
    const r = findMarkersDetailed(renderLit(centers.slice(0, 3), projToCam), gray(320, 240, 25));
    expect(r.points).toBeNull();
    expect(r.seen).toBe(3);
    expect(r.changed.width).toBe(320);
  });
});
