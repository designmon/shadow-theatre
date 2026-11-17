import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { saveCapture } from './captures';
import { handleHealth, type HealthClient } from './health';
import { CLIENT_OPTIONS, handleRecognize, UNKNOWN, type RecognizeClient } from './recognize';

const PORT = Number(process.env.PORT ?? 8787);
let anthropic: Anthropic | null = null;
try {
  anthropic = new Anthropic(CLIENT_OPTIONS);
} catch (err) {
  console.error('No Anthropic credentials:', err instanceof Error ? err.message : err);
}

createServer(async (req, res) => {
  const json = (body: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'GET' && req.url === '/api/health') return json(await handleHealth(anthropic as unknown as HealthClient));
  if (req.method !== 'POST' || req.url !== '/api/recognize') {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (!anthropic) return json(UNKNOWN);
  const started = Date.now();
  const png = Buffer.concat(chunks);
  const rec = await handleRecognize(png, anthropic as unknown as RecognizeClient);
  const ms = Date.now() - started;
  const file = saveCapture('captures', png, rec, ms);
  console.log(`[recognize] ${rec.kind} (${rec.confidence.toFixed(2)}) in ${ms} ms  -> captures/${file}`);
  json(rec);
}).listen(PORT, () => console.log(`recognition server on http://localhost:${PORT}`));
