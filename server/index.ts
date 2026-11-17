import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { saveCalibrationFrames, saveCapture, saveDoodle } from './captures';
import { handleHealth, type HealthClient } from './health';
import { jevHealth, MODEL, recognizeDoodleWithJev, recognizeWithJev } from './jev';
import { CLIENT_OPTIONS, handleRecognize, UNKNOWN, type RecognizeClient } from './recognize';

const PORT = Number(process.env.PORT ?? 8787);
// Jev (OpenRouter) when an OpenRouter key is set, otherwise Claude.
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
console.log(OPENROUTER_KEY ? `recognition: ${MODEL} on OpenRouter` : 'recognition: Claude (set OPENROUTER_API_KEY to use Jev)');
let anthropic: Anthropic | null = null;
try {
  anthropic = new Anthropic(CLIENT_OPTIONS);
} catch (err) {
  console.error('No Anthropic credentials:', err instanceof Error ? err.message : err);
}

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
