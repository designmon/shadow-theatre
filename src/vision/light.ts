import type { RGB } from '../camera';
import type { Gray } from '../types';

/**
 * How much of the projector's light reaches each camera pixel, judged per colour channel.
 *
 * Calibration sees every pixel with the projector black and white. A channel is used where the
 * projector clearly brightens it (a channel the room's lamps already flood, like red under warm
 * light, is left out). A frame pixel's "lit" value is the most-lit of its usable channels,
 * 0 = projector light gone (a shadow), 255 = as bright as the white wall.
 *
 * So our blue ink, which still sends full blue light, reads as lit wall — never as a shadow,
 * even if the camera's map of the wall is a few pixels off — while a hand's shadow takes away
 * all channels, including over a drawing.
 */
export type Light = { width: number; height: number; dark: [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray]; inv: Float32Array /* 3 per px, 0 = channel not usable */; white: Gray; black: Gray };

const MIN_CHANNEL = 10; // the projector must brighten a channel at least this much
const OF_BEST = 0.4; // ... and at least this share of the pixel's best channel

export function buildLight(dark: RGB, white: RGB): Light {
  const { width, height } = dark.r, n = width * height;
  const D = [dark.r.data, dark.g.data, dark.b.data] as const, Wt = [white.r.data, white.g.data, white.b.data] as const;
  const inv = new Float32Array(n * 3), w = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const c0 = Wt[0][i] - D[0][i], c1 = Wt[1][i] - D[1][i], c2 = Wt[2][i] - D[2][i];
    const best = Math.max(c0, c1, c2);
    if (best < MIN_CHANNEL) continue; // the projector doesn't reach here
    w[i] = 255;
    const cs = [c0, c1, c2];
    for (let c = 0; c < 3; c++) if (cs[c] >= MIN_CHANNEL && cs[c] >= OF_BEST * best) inv[i * 3 + c] = 255 / cs[c];
  }
  return { width, height, dark: [Uint8ClampedArray.from(D[0]), Uint8ClampedArray.from(D[1]), Uint8ClampedArray.from(D[2])], inv, white: { width, height, data: w }, black: { width, height, data: new Uint8ClampedArray(n) } };
}

/** The frame as "how lit by the projector" (0..255), comparable with light.white / light.black. */
export function litFrame(rgb: RGB, light: Light): Gray {
  const n = light.width * light.height, out = new Uint8ClampedArray(n);
  const F = [rgb.r.data, rgb.g.data, rgb.b.data];
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let c = 0; c < 3; c++) {
      const k = light.inv[i * 3 + c];
      if (k) v = Math.max(v, (F[c][i] - light.dark[c][i]) * k);
    }
    out[i] = v;
  }
  return { width: light.width, height: light.height, data: out };
}
