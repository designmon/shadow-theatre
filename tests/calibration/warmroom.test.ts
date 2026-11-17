import { describe, expect, it } from 'vitest';
import { rgbaToLuma } from '../../src/camera';
import { solveCalibration } from '../../src/calibration/calibrate';
import { patternCenters } from '../../src/calibration/pattern';
import type { Gray } from '../../src/types';

// A living room with warm lamps, filmed from the side: the wall is orange-lit with red near the
// top of the camera's range; the projected picture sits in the middle of the view, and the
// projector's light also spills onto the room around it (ceiling, furniture).
const W = 320, H = 240, PW = 1280, PH = 720;
const pic = { x0: 70, y0: 50, x1: 270, y1: 170 }; // where the picture lands in the camera
const inPic = (x: number, y: number) => x >= pic.x0 && x < pic.x1 && y >= pic.y0 && y < pic.y1;
const toCam = (p: { x: number; y: number }) => ({ x: pic.x0 + (p.x / PW) * (pic.x1 - pic.x0), y: pic.y0 + (p.y / PH) * (pic.y1 - pic.y0) });

function frame(projected: (x: number, y: number) => number /* 0..1 projector light at this camera px */, proj: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lamp = 1 - (x / W) * 0.35; // warm lamp on the left
    let r = 245 * lamp, g = 140 * lamp, b = 70 * lamp; // orange, red almost at the top
    if (inPic(x, y)) { const p = projected(x, y); r += proj * p; g += proj * p; b += proj * p; }
    else {
      // spill: the room around the picture catches some projector light (strongest near it)
      const d = Math.hypot(Math.max(pic.x0 - x, 0, x - pic.x1), Math.max(pic.y0 - y, 0, y - pic.y1));
      const p = projected(Math.min(Math.max(x, pic.x0), pic.x1 - 1), Math.min(Math.max(y, pic.y0), pic.y1 - 1)) * Math.max(0, 1 - d / 60) * 0.55;
      r += 60 * p; g += 70 * p; b += 90 * p;
    }
    const i = (y * W + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
  }
  return rgba;
}

for (const strength of [60, 120]) describe(`calibration in a warm-lit room (projector adds ${strength})`, () => {
  const proj = strength;
  const centers = patternCenters(PW, PH, 0.12);
  const half = 0.06 * (pic.y1 - pic.y0); // squares ~12% of the picture height
  const cams = centers.map(toCam);
  const black = frame(() => 0, proj);
  const squares = frame((x, y) => (cams.some((c) => Math.abs(x - c.x) < half && Math.abs(y - c.y) < half) ? 1 : 0), proj);
  const white = frame(() => 1, proj);
  const gray = (f: (rgba: Uint8ClampedArray, n: number) => Uint8ClampedArray, rgba: Uint8ClampedArray): Gray => ({ width: W, height: H, data: f(rgba, W * H) });

  it('the glow around the picture does not make the squares look wrong', () => {
    const s = solveCalibration(gray(rgbaToLuma, black), gray(rgbaToLuma, squares), gray(rgbaToLuma, white), centers, PW, PH);
    expect(s.method).toBe('squares');
    const p = s.camToProj; // the picture's top-left corner maps back to (0,0)
    const x = (p[0] * pic.x0 + p[1] * pic.y0 + p[2]) / (p[6] * pic.x0 + p[7] * pic.y0 + p[8]);
    expect(Math.abs(x)).toBeLessThan(PW * 0.03);
  });
});
