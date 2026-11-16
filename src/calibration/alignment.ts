import type { Gray, Mask } from '../types';

/**
 * How well what we project dark lines up with what the camera sees dark:
 * the fraction of projected-dark (lit-wall) pixels that the camera sees dark.
 * 1 when nothing is projected dark.
 */
export function alignmentScore(frame: Gray, whiteRef: Gray, projectedDarkCam: Mask): number {
  const ratios: number[] = [];
  for (let i = 0; i < frame.data.length; i += 7) {
    if (!projectedDarkCam.data[i] && whiteRef.data[i] >= 40) ratios.push(frame.data[i] / whiteRef.data[i]);
  }
  ratios.sort((a, b) => a - b);
  const upper = ratios.slice(Math.floor(ratios.length * 0.3));
  const gain = upper.length ? upper[Math.floor(upper.length / 2)] : 1;
  let total = 0, dark = 0;
  for (let i = 0; i < frame.data.length; i++) {
    if (!projectedDarkCam.data[i] || whiteRef.data[i] < 40) continue;
    total++;
    if (frame.data[i] < 0.45 * gain * whiteRef.data[i]) dark++;
  }
  return total === 0 ? 1 : dark / total;
}
