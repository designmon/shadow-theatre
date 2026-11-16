import type { Recognition } from '../types';

const UNKNOWN: Recognition = { kind: 'unknown', confidence: 0, facing: 'right', anchor: { x: 0.5, y: 0.5 } };

/** Ask the local server what the silhouette is. Never rejects: any failure is `unknown`. */
export async function recognize(png: Blob, timeoutMs = 4000): Promise<Recognition> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/recognize', { method: 'POST', body: png, headers: { 'content-type': 'image/png' }, signal: ctl.signal });
    if (!res.ok) return UNKNOWN;
    return (await res.json()) as Recognition;
  } catch {
    return UNKNOWN;
  } finally {
    clearTimeout(timer);
  }
}
