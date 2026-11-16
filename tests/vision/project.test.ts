import { describe, expect, it } from 'vitest';
import { projectBox, projectMask } from '../../src/vision/project';
import { bbox, count, fillRect, mask } from '../helpers';

const camToProj = [6, 0, 0, 0, 4.5, 0, 0, 0, 1]; // 320x240 -> 1920x1080
const projToCam = [1 / 6, 0, 0, 0, 1 / 4.5, 0, 0, 0, 1];

describe('project camera shapes into projector space', () => {
  it('projectBox scales a box through the homography', () => {
    expect(projectBox({ x: 10, y: 20, w: 30, h: 40 }, camToProj)).toEqual({ x: 60, y: 90, w: 180, h: 180 });
  });

  it('projectMask returns the cropped silhouette and its projector box', () => {
    const m = fillRect(mask(320, 240), 10, 20, 30, 40, 1);
    const out = projectMask(m, { x: 10, y: 20, w: 30, h: 40 }, camToProj, projToCam);
    expect(out.box).toEqual({ x: 60, y: 90, w: 180, h: 180 });
    expect(out.mask.width).toBe(180);
    expect(bbox(out.mask)).toEqual({ x: 0, y: 0, w: 180, h: 180 });
    expect(count(out.mask)).toBe(180 * 180);
  });
});
