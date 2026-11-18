import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join } from 'node:path';

/**
 * Runway phase 1: a manual round-trip.
 * The page exports each drawing (and the whole wall on E) to captures/runway-in/ as an image plus
 * its prompt; the user generates in the Runway web app and drops the clips into
 * captures/runway-out/; this watches that folder and tells the page.
 */
export const RUNWAY_IN = 'captures/runway-in';
export const RUNWAY_OUT = 'captures/runway-out';
const CLIP_TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };

/** Ids are made by the page; keep them to a safe file name. */
export function safeName(name: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(name) ? name : null;
}

export type RunwayExport = { name: string; png: string /* base64 */; prompt: string; meta: unknown };

/** Write <name>.png, <name>.txt and <name>.json into the runway-in folder. */
export function saveRunwayInput(x: RunwayExport, dir = RUNWAY_IN): string {
  const name = safeName(x.name);
  if (!name) throw new Error('bad name');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.png`), Buffer.from(x.png, 'base64'));
  writeFileSync(join(dir, `${name}.txt`), x.prompt.trim() + '\n');
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(x.meta, null, 2) + '\n');
  return name;
}

/** Video files in the runway-out folder (names only). */
export function listClips(dir = RUNWAY_OUT): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => CLIP_TYPES[extname(f).toLowerCase()] && !f.startsWith('.')).sort();
}

/**
 * Watches the runway-out folder: a clip is announced once its size has stopped changing
 * (a download or copy in progress isn't).
 */
export class ClipWatcher {
  private sizes = new Map<string, number>();
  private ready = new Set<string>();
  private listeners = new Set<(file: string) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private dir = RUNWAY_OUT) {}

  start(everyMs = 1000): void {
    mkdirSync(this.dir, { recursive: true });
    this.scan();
    this.timer = setInterval(() => this.scan(), everyMs);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
  /** Clips ready to play. */
  get clips(): string[] {
    return [...this.ready].sort();
  }
  /** Changes when the file is replaced (so the page doesn't play a cached old version). */
  version(file: string): number {
    return this.sizes.get(file) ?? 0;
  }
  onClip(f: (file: string) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  scan(): void {
    const seen = new Set<string>();
    for (const f of listClips(this.dir)) {
      seen.add(f);
      let size = -1;
      try { size = statSync(join(this.dir, f)).size; } catch { continue; }
      const before = this.sizes.get(f);
      this.sizes.set(f, size);
      if (before !== undefined && before !== size) this.ready.delete(f); // replaced: wait until it settles again
      if (size > 0 && before === size && !this.ready.has(f)) {
        this.ready.add(f);
        for (const l of this.listeners) l(f);
      }
    }
    for (const f of [...this.sizes.keys()]) if (!seen.has(f)) { this.sizes.delete(f); this.ready.delete(f); }
  }
}

/** Server-Sent Events: the current clips on connect, then each new one. */
export function streamClipEvents(req: IncomingMessage, res: ServerResponse, watcher: ClipWatcher, status?: { onStatus(f: (s: object) => void): () => void }): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const send = (file: string, initial: boolean) => res.write(`data: ${JSON.stringify({ file, initial, url: `/api/runway/out/${encodeURIComponent(file)}?v=${watcher.version(file)}` })}\n\n`);
  for (const f of watcher.clips) send(f, true); // already there: known, but not news
  const off = watcher.onClip((f) => send(f, false));
  // phase 2: a clip being generated for a drawing (it shimmers), or a failure (it doesn't)
  const offStatus = status?.onStatus((s) => res.write(`data: ${JSON.stringify(s)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { off(); offStatus?.(); clearInterval(ping); });
}

/** Serve a clip, with range requests (video seeking). */
export function serveClip(req: IncomingMessage, res: ServerResponse, file: string, dir = RUNWAY_OUT): void {
  const type = CLIP_TYPES[extname(file).toLowerCase()];
  if (!type || file.includes('/') || file.includes('\\') || file.startsWith('.') || !listClips(dir).includes(file)) { res.writeHead(404).end(); return; }
  const path = join(dir, file), size = statSync(path).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
  createReadStream(path).pipe(res);
}
