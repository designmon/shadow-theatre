import type { H, Mask, Pt } from '../types';

/** Solve A x = b in place (Gaussian elimination with partial pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('degenerate homography');
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/** Homography mapping src[i] -> dst[i] (DLT, h33 = 1). With >4 points, least squares via normal equations. */
export function solveHomography(src: Pt[], dst: Pt[]): H {
  if (src.length < 4 || src.length !== dst.length) throw new Error('need >= 4 point pairs');
  const rows: number[][] = [];
  const rhs: number[] = [];
  src.forEach((s, i) => {
    const d = dst[i];
    rows.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]); rhs.push(d.x);
    rows.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]); rhs.push(d.y);
  });
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  rows.forEach((r, i) => {
    for (let a = 0; a < 8; a++) {
      Atb[a] += r[a] * rhs[i];
      for (let c = 0; c < 8; c++) AtA[a][c] += r[a] * r[c];
    }
  });
  return [...solve(AtA, Atb), 1];
}

export function applyH(h: H, p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invertH(h: H): H {
  const [a, b, c, d, e, f, g, i, k] = h;
  const A = e * k - f * i, B = -(d * k - f * g), C = d * i - e * g;
  const det = a * A + b * B + c * C;
  const inv = [A, -(b * k - c * i), b * f - c * e, B, a * k - c * g, -(a * f - c * d), C, -(a * i - b * g), a * e - b * d];
  return inv.map((v) => v / det / (inv[8] / det));
}

/** Nearest-neighbour inverse warp. `h` maps OUTPUT pixel coords -> INPUT pixel coords. */
export function warpMask(mask: Mask, h: H, outW: number, outH: number): Mask {
  const out: Mask = { width: outW, height: outH, data: new Uint8Array(outW * outH) };
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const p = applyH(h, { x, y });
    const sx = Math.round(p.x), sy = Math.round(p.y);
    if (sx >= 0 && sy >= 0 && sx < mask.width && sy < mask.height) out.data[y * outW + x] = mask.data[sy * mask.width + sx];
  }
  return out;
}

/** Camera pixels that show the projected picture (their pixel centre maps inside the projector frame). */
export function wallMask(camToProj: H, projW: number, projH: number, camW: number, camH: number): Mask {
  const out: Mask = { width: camW, height: camH, data: new Uint8Array(camW * camH) };
  for (let y = 0; y < camH; y++) for (let x = 0; x < camW; x++) {
    const p = applyH(camToProj, { x: x + 0.5, y: y + 0.5 });
    if (p.x >= 0 && p.y >= 0 && p.x < projW && p.y < projH) out.data[y * camW + x] = 1;
  }
  return out;
}
