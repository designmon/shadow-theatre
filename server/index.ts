import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { saveCalibrationFrames, saveCapture, saveDoodle } from './captures';
import { ClipWatcher, saveRunwayInput, serveClip, streamClipEvents, type RunwayExport } from './runway';
import { RunwayGenerator } from './runwayApi';
import { COMMAND_MODEL, planCommand, type SceneItem } from './command';
import { handleHealth, type HealthClient } from './health';
import { jevHealth, MODEL, recognizeDoodleWithJev, recognizeWithJev } from './jev';
import { CLIENT_OPTIONS, handleRecognize, UNKNOWN, type RecognizeClient } from './recognize';

const PORT = Number(process.env.PORT ?? 8787);
// Jev (OpenRouter) when an OpenRouter key is set, otherwise Claude.
// tolerate a pasted key with spaces or quotes around it
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY?.trim().replace(/^['"]|['"]$/g, '') || undefined;
if (OPENROUTER_KEY) {
  // never print the key: just enough to spot a placeholder or a cut-off paste
  const looksRight = OPENROUTER_KEY.startsWith('sk-or-') && OPENROUTER_KEY.length > 40;
  console.log(`OpenRouter key: starts ${OPENROUTER_KEY.slice(0, 6)}…, ${OPENROUTER_KEY.length} characters${looksRight ? '' : '  ⚠ that does not look like an OpenRouter key (they start sk-or- and are ~70 characters)'}`);
}
console.log(OPENROUTER_KEY ? `recognition: ${MODEL} on OpenRouter` : 'recognition: Claude (set OPENROUTER_API_KEY to use Jev)');
let anthropic: Anthropic | null = null;
try {
  anthropic = new Anthropic(CLIENT_OPTIONS);
} catch (err) {
  console.error('No Anthropic credentials:', err instanceof Error ? err.message : err);
}

const clips = new ClipWatcher();
// Runway phase 2: automatic with RUNWAYML_API_SECRET (server only); without it, the manual round-trip
const runway = RunwayGenerator.fromEnv();
console.log(`voice commands: ${OPENROUTER_KEY ? COMMAND_MODEL + ' on OpenRouter' : 'simple phrases only (set OPENROUTER_API_KEY)'}`);
console.log(runway ? `runway: automatic via the API (${runway.model}, up to ${runway.dailyCap} a day, ${runway.usedToday()} used today)` : 'runway: manual (set RUNWAYML_API_SECRET to generate automatically)');
clips.start();
clips.onClip((f) => console.log(`[runway] clip ready: captures/runway-out/${f}`));

createServer(async (req, res) => {
  const json = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'GET' && req.url === '/api/health') return json(OPENROUTER_KEY ? await jevHealth(OPENROUTER_KEY) : await handleHealth(anthropic as unknown as HealthClient, { keySet: !!process.env.ANTHROPIC_API_KEY }));
  if (req.method === 'POST' && req.url === '/api/doodle') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const png = Buffer.concat(chunks), started = Date.now();
    const rec = OPENROUTER_KEY ? await recognizeDoodleWithJev(png, OPENROUTER_KEY) : { what: 'something', motion: 'float', confidence: 0, note: 'set OPENROUTER_API_KEY to recognise drawings' };
    const ms = Date.now() - started;
    console.log(`[doodle] ${rec.what} → ${rec.motion} (${rec.confidence.toFixed(2)}) in ${ms} ms${rec.note ? '  — ' + rec.note : ''}`);
    try { saveDoodle('captures/doodles', png, rec.what, rec.motion, ms, MODEL); } catch { /* saving is best-effort */ }
    return json(rec);
  }
  // voice commands: the words + what's on the wall -> a little script for the drawings
  if (req.method === 'POST' && req.url === '/api/command') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      const { text, items } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { text: string; items: SceneItem[] };
      const started = Date.now();
      const plan = await planCommand(String(text ?? '').slice(0, 500), Array.isArray(items) ? items.slice(0, 40) : [], OPENROUTER_KEY);
      console.log(`[command] "${text}" -> ${plan.steps.length} steps in ${Date.now() - started} ms${plan.note ? '  — ' + plan.note : ''}: ${plan.story}`);
      return json(plan);
    } catch (err) {
      res.writeHead(400).end(String(err instanceof Error ? err.message : err));
      return;
    }
  }
  // Runway, phase 1: exports in, clips out (server/runway.ts)
  if (req.method === 'POST' && req.url === '/api/runway/in') {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      const name = saveRunwayInput(JSON.parse(Buffer.concat(chunks).toString('utf8')) as RunwayExport);
      console.log(`[runway] saved captures/runway-in/${name}.png + .txt`);
      if (runway) void runway.generate(name); // phase 2: off to Runway; the clip lands in runway-out/
      return json({ ok: true, name, auto: !!runway });
    } catch (err) {
      res.writeHead(400).end(String(err instanceof Error ? err.message : err));
      return;
    }
  }
  if (req.method === 'GET' && req.url === '/api/runway/events') return streamClipEvents(req, res, clips, runway ?? undefined);
  if (req.method === 'GET' && req.url?.startsWith('/api/runway/out/')) return serveClip(req, res, decodeURIComponent(req.url.slice('/api/runway/out/'.length).split('?')[0]));
  if (req.method === 'POST' && req.url?.startsWith('/api/calibration')) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const why = new URL(req.url, 'http://x').searchParams.get('why') ?? '';
    try {
      const file = saveCalibrationFrames('captures/calibration', Buffer.concat(chunks), why);
      console.log(`[calibration] failed — camera frames saved to captures/calibration/${file}`);
    } catch { /* best-effort */ }
    return json({ ok: true });
  }
  if (req.method !== 'POST' || req.url !== '/api/recognize') {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const started = Date.now();
  const png = Buffer.concat(chunks);
  if (!OPENROUTER_KEY && !anthropic) return json(UNKNOWN);
  const rec = OPENROUTER_KEY ? await recognizeWithJev(png, OPENROUTER_KEY) : await handleRecognize(png, anthropic as unknown as RecognizeClient);
  const ms = Date.now() - started;
  const file = saveCapture('captures', png, rec, ms);
  console.log(`[recognize] ${rec.kind} (${rec.confidence.toFixed(2)}) in ${ms} ms${rec.note ? `  — ${rec.note}` : ''}  -> captures/${file}`);
  json(rec);
}).listen(PORT, () => console.log(`recognition server on http://localhost:${PORT}`));
