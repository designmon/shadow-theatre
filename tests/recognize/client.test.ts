import { afterEach, describe, expect, it, vi } from 'vitest';
import { recognize } from '../../src/recognize/client';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('recognize client', () => {
  it('client passes through server JSON', async () => {
    const rec = { kind: 'rabbit', confidence: 0.8, facing: 'left', anchor: { x: 0.3, y: 0.2 } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(rec), { status: 200 })));
    expect(await recognize(new Blob(['x']))).toEqual(rec);
  });

  it('client times out to unknown', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const p = recognize(new Blob(['x']), 4000);
    await vi.advanceTimersByTimeAsync(4001);
    expect((await p).kind).toBe('unknown');
  });

  it('non-200 resolves unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
    expect((await recognize(new Blob(['x']))).kind).toBe('unknown');
  });
});
