import { applyH } from '../calibration/homography';
import type { Box, H, Mask } from '../types';

/** Bounding box (projector px) of a camera-space box mapped through camToProj. */
export function projectBox(b: Box, camToProj: H): Box {
  const pts = [
    { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
  ].map((p) => applyH(camToProj, p));
  const x0 = Math.floor(Math.min(...pts.map((p) => p.x))), y0 = Math.floor(Math.min(...pts.map((p) => p.y)));
  const x1 = Math.ceil(Math.max(...pts.map((p) => p.x))), y1 = Math.ceil(Math.max(...pts.map((p) => p.y)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The camera silhouette inside `box`, warped into projector space and cropped to its projector box. */
export function projectMask(m: Mask, box: Box, camToProj: H, projToCam: H): { mask: Mask; box: Box } {
  const pb = projectBox(box, camToProj);
  const out: Mask = { width: pb.w, height: pb.h, data: new Uint8Array(pb.w * pb.h) };
  for (let y = 0; y < pb.h; y++) for (let x = 0; x < pb.w; x++) {
    const p = applyH(projToCam, { x: pb.x + x + 0.5, y: pb.y + y + 0.5 });
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    if (sx >= box.x && sy >= box.y && sx < box.x + box.w && sy < box.y + box.h) out.data[y * pb.w + x] = m.data[sy * m.width + sx];
  }
  return { mask: out, box: pb };
}
