import type { Gray } from './types';

const CAMERA_KEY = 'shadow-theatre:camera';

/** The camera picked last time (remembered in this browser), if any. */
export function savedCameraId(): string | null {
  try { return localStorage.getItem(CAMERA_KEY); } catch { return null; }
}
export function saveCameraId(id: string): void {
  try { localStorage.setItem(CAMERA_KEY, id); } catch { /* private mode: just don't remember */ }
}

/** Video inputs with readable names (names are only available after camera permission). */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
}

export async function startCamera(deviceId?: string | null): Promise<{ video: HTMLVideoElement; stream: MediaStream; label: string }> {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { ...base, deviceId: { exact: deviceId } } : base, audio: false });
  } catch (err) {
    if (!deviceId) throw err;
    stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); // remembered camera is gone
  }
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  return { video, stream, label: stream.getVideoTracks()[0]?.label || 'camera' };
}

let scratch: OffscreenCanvas | null = null;

/**
 * Downscaled grayscale (luminance) frame from the webcam. Read at twice the size, then halved
 * keeping the darkest pixel of each 2x2 block: thin finger shadows stay dark instead of being
 * averaged into the white wall.
 */
export function grabGray(video: HTMLVideoElement, w = 320, h = 240): Gray {
  return grabFrame(video, w, h).luma;
}

export type RGB = { r: Gray; g: Gray; b: Gray };

/**
 * One camera frame: ordinary brightness (luma, for calibration and the lit area) and each colour
 * channel (for finding shadows, see vision/light.ts). Read at twice the size, halved keeping the
 * darkest pixel of each 2x2 block.
 */
export function grabFrame(video: HTMLVideoElement, w = 320, h = 240): { luma: Gray; rgb: RGB } {
  const W = w * 2, H = h * 2;
  if (!scratch || scratch.width !== W || scratch.height !== H) scratch = new OffscreenCanvas(W, H);
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, W, H);
  const rgba = ctx.getImageData(0, 0, W, H).data;
  const n = W * H, r = new Uint8ClampedArray(n), g = new Uint8ClampedArray(n), b = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) { r[j] = rgba[i]; g[j] = rgba[i + 1]; b[j] = rgba[i + 2]; }
  return { luma: minPool2(rgbaToLuma(rgba, n), W, H), rgb: { r: minPool2(r, W, H), g: minPool2(g, W, H), b: minPool2(b, W, H) } };
}

/** Ordinary (luminance) brightness. */
export function rgbaToLuma(rgba: Uint8ClampedArray, n: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return out;
}

/** Halve a picture, keeping the darkest pixel of each 2x2 block. */
export function minPool2(src: Uint8ClampedArray, W: number, H: number): Gray {
  const w = W >> 1, h = H >> 1, data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * W + 2 * x;
    data[y * w + x] = Math.min(src[i], src[i + 1], src[i + W], src[i + W + 1]);
  }
  return { width: w, height: h, data };
}
