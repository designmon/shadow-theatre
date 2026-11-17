import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { saveCapture } from './captures';
import { handleHealth, type HealthClient } from './health';
import { jevHealth, recognizeWithJev } from './jev';
import { CLIENT_OPTIONS, handleRecognize, UNKNOWN, type RecognizeClient } from './recognize';

const PORT = Number(process.env.PORT ?? 8787);
// Jev (OpenRouter) when an OpenRouter key is set, otherwise Claude.
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
console.log(OPENROUTER_KEY ? 'recognition: Jev (typesafe/jev-1.14 on OpenRouter)' : 'recognition: Claude (set OPENROUTER_API_KEY to use Jev)');
let anthropic: Anthropic | null = null;
try {
  anthropic = new Anthropic(CLIENT_OPTIONS);
} catch (err) {
  console.error('No Anthropic credentials:', err instanceof Error ? err.message : err);
}

createServer(async (req, res) => {
  const json = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'GET' && req.url === '/api/health') return json(OPENROUTER_KEY ? await jevHealth(OPENROUTER_KEY) : await handleHealth(anthropic as unknown as HealthClient, { keySet: !!process.env.ANTHROPIC_API_KEY }));
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
  console.log(`[recognize] ${rec.kind} (${rec.confidence.toFixed(2)}) in ${ms} ms  -> captures/${file}`);
  json(rec);
}).listen(PORT, () => console.log(`recognition server on http://localhost:${PORT}`));
