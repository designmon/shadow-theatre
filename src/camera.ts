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

/** Downscaled grayscale (luminance) frame from the webcam. */
export function grabGray(video: HTMLVideoElement, w = 320, h = 240): Gray {
  if (!scratch || scratch.width !== w || scratch.height !== h) scratch = new OffscreenCanvas(w, h);
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) {
    data[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return { width: w, height: h, data };
}
