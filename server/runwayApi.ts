import RunwayML, { TaskFailedError, TaskTimedOutError } from '@runwayml/sdk';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNWAY_IN, RUNWAY_OUT } from './runway';

/**
 * Runway phase 2: the round-trip, automatic. After the page exports a drawing (or the wall, on E),
 * the server sends the image and its prompt to Runway image-to-video, waits for the task and saves
 * the clip into captures/runway-out/ — where phase 1's watcher and playback take over.
 *
 * The key stays here: RUNWAYML_API_SECRET in the server's environment, never sent to the page.
 * RUNWAY_MODEL picks the model (default gen4_turbo), RUNWAY_DAILY_CAP limits generations per day.
 */

type CreateBody = Record<string, unknown>;
/** The part of the official SDK we use (so tests can stand in for it). */
export type RunwayClient = { imageToVideo: { create(body: CreateBody): { waitForTaskOutput(opts?: { timeout?: number }): Promise<{ id: string; output: string[] }> } } };
export type RunwayStatus = { pending: string } | { failed: string; why: string };

export const DEFAULT_MODEL = 'gen4_turbo';
const MAX_PROMPT = 1000; // the API's limit (UTF-16 code units)
const TIMEOUT_MS = 10 * 60 * 1000;

/** Duration the model accepts: Veo takes 4, 6 or 8 s; Runway's own models take 5 or 10. */
export function requestFor(model: string, promptImage: string, promptText: string): CreateBody {
  const duration = Number(process.env.RUNWAY_DURATION) || (model.startsWith('veo') ? 4 : 5);
  return { model, promptImage, promptText: promptText.slice(0, MAX_PROMPT), ratio: '1280:720', duration };
}

export class RunwayGenerator {
  private inFlight = new Set<string>();
  private listeners = new Set<(s: RunwayStatus) => void>();
  readonly model: string;
  readonly dailyCap: number;

  constructor(
    private client: RunwayClient,
    opts: { model?: string; dailyCap?: number; inDir?: string; outDir?: string; fetchFn?: typeof fetch; today?: () => string } = {},
  ) {
    this.model = opts.model || DEFAULT_MODEL;
    this.dailyCap = opts.dailyCap ?? 20;
    this.inDir = opts.inDir ?? RUNWAY_IN;
    this.outDir = opts.outDir ?? RUNWAY_OUT;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
  }
  private inDir: string;
  private outDir: string;
  private fetchFn: typeof fetch;
  private today: () => string;

  /** From the environment, or null when there's no key (phase 1 still works). */
  static fromEnv(): RunwayGenerator | null {
    const key = process.env.RUNWAYML_API_SECRET?.trim();
    if (!key) return null;
    return new RunwayGenerator(new RunwayML({ apiKey: key }) as unknown as RunwayClient, { model: process.env.RUNWAY_MODEL, dailyCap: Number(process.env.RUNWAY_DAILY_CAP) || 20 });
  }

  onStatus(f: (s: RunwayStatus) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit(s: RunwayStatus) {
    for (const l of this.listeners) l(s);
  }

  /** Generations started today (kept on disk, so a restart doesn't reset the cap). */
  private countFile() { return join(this.inDir, '.runway-generations.json'); }
  usedToday(): number {
    try { const j = JSON.parse(readFileSync(this.countFile(), 'utf8')); return j.day === this.today() ? j.count : 0; } catch { return 0; }
  }
  private countOne() {
    mkdirSync(this.inDir, { recursive: true });
    writeFileSync(this.countFile(), JSON.stringify({ day: this.today(), count: this.usedToday() + 1 }));
  }

  /**
   * Generate the clip for an exported image (captures/runway-in/<name>.png + .txt). One per name:
   * skipped if a clip is already there or on its way. Never throws: failures are logged and
   * announced, and the drawing simply keeps its built-in animation.
   */
  async generate(name: string): Promise<string | null> {
    if (this.inFlight.has(name) || existsSync(join(this.outDir, `${name}.mp4`))) return null;
    if (this.usedToday() >= this.dailyCap) { this.fail(name, `daily cap of ${this.dailyCap} reached (RUNWAY_DAILY_CAP)`); return null; }
    let png: Buffer, prompt: string;
    try {
      png = readFileSync(join(this.inDir, `${name}.png`));
      prompt = readFileSync(join(this.inDir, `${name}.txt`), 'utf8').trim();
    } catch { this.fail(name, 'export not found'); return null; }
    if (png.length > 5 * 1024 * 1024 * 0.74) { this.fail(name, 'image too big for a data URI (5 MB)'); return null; }
    this.inFlight.add(name);
    this.countOne();
    this.emit({ pending: name });
    const started = Date.now();
    console.log(`[runway] generating ${name} with ${this.model}…`);
    try {
      const task = await this.client.imageToVideo.create(requestFor(this.model, `data:image/png;base64,${png.toString('base64')}`, prompt)).waitForTaskOutput({ timeout: TIMEOUT_MS });
      const url = task.output?.[0];
      if (!url) throw new Error('task finished without an output');
      const res = await this.fetchFn(url); // signed URLs expire: keep our own copy
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      mkdirSync(this.outDir, { recursive: true });
      const part = join(this.outDir, `.${name}.mp4.part`); // hidden until complete, then the watcher sees it
      writeFileSync(part, Buffer.from(await res.arrayBuffer()));
      renameSync(part, join(this.outDir, `${name}.mp4`));
      console.log(`[runway] ${name}.mp4 ready in ${Math.round((Date.now() - started) / 1000)} s (task ${task.id})`);
      return `${name}.mp4`;
    } catch (err) {
      const why = err instanceof TaskFailedError ? `task failed: ${JSON.stringify((err.taskDetails as { failure?: unknown; failureCode?: unknown }).failure ?? err.message)}${(err.taskDetails as { failureCode?: string }).failureCode ? ` (${(err.taskDetails as { failureCode?: string }).failureCode})` : ''}`
        : err instanceof TaskTimedOutError ? 'task timed out (10 min)'
        : err instanceof Error ? err.message : String(err);
      this.fail(name, why);
      return null;
    } finally {
      this.inFlight.delete(name);
    }
  }

  private fail(name: string, why: string) {
    console.log(`[runway] ${name}: ${why} — it keeps its built-in animation`);
    this.emit({ failed: name, why });
  }
}
