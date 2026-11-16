import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'node:http';
import { handleRecognize, type RecognizeClient } from './recognize';

const PORT = Number(process.env.PORT ?? 8787);
const client = new Anthropic() as unknown as RecognizeClient;

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/recognize') {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const started = Date.now();
  const rec = await handleRecognize(Buffer.concat(chunks), client);
  console.log(`[recognize] ${rec.kind} (${rec.confidence.toFixed(2)}) in ${Date.now() - started} ms`);
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(rec));
}).listen(PORT, () => console.log(`recognition server on http://localhost:${PORT}`));
