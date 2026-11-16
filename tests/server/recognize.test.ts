import { describe, expect, it } from 'vitest';
import { handleRecognize, type RecognizeClient } from '../../server/recognize';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const fake = (impl: (params: any) => Promise<any>) => {
  const calls: any[] = [];
  const client: RecognizeClient = { beta: { messages: { parse: (p: any) => { calls.push(p); return impl(p); } } } };
  return { client, calls };
};

describe('handleRecognize', () => {
  it('returns parsed recognition', async () => {
    const out = { kind: 'dog', confidence: 0.9, facing: 'right', anchor: { x: 0.7, y: 0.4 } };
    const { client, calls } = fake(async () => ({ stop_reason: 'end_turn', parsed_output: out }));
    expect(await handleRecognize(png, client)).toEqual(out);
    const p = calls[0];
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.output_config.effort).toBe('low');
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toContain('server-side-fallback-2026-07-01');
    expect(p.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } });
  });

  it('low confidence becomes unknown', async () => {
    const { client } = fake(async () => ({ stop_reason: 'end_turn', parsed_output: { kind: 'swan', confidence: 0.3, facing: 'up', anchor: { x: 0.5, y: 0.1 } } }));
    expect((await handleRecognize(png, client)).kind).toBe('unknown');
  });

  it('refusal resolves unknown', async () => {
    const { client } = fake(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    expect((await handleRecognize(png, client)).kind).toBe('unknown');
  });

  it('server error resolves unknown', async () => {
    const { client } = fake(async () => { throw new Error('boom'); });
    expect(await handleRecognize(png, client)).toEqual({ kind: 'unknown', confidence: 0, facing: 'right', anchor: { x: 0.5, y: 0.5 } });
  });
});

import { CLIENT_OPTIONS } from '../../server/recognize';
describe('review I7: server client options', () => {
  it('does not keep retrying requests the browser gave up on', () => {
    expect(CLIENT_OPTIONS).toEqual({ timeout: 6000, maxRetries: 0 });
  });
});
