import type { Health } from '../src/setup/checklist';

/** The slice of the Anthropic client the health check needs (or null if it couldn't be created). */
export type HealthClient = { models: { retrieve: (id: string) => Promise<unknown> } } | null;

/** Checks the key works with a free Models API call; never throws. */
export async function handleHealth(client: HealthClient, env: { keySet: boolean } = { keySet: true }): Promise<Health> {
  if (!client) return { ok: true, claude: 'no-key' };
  const started = Date.now();
  try {
    await client.models.retrieve('claude-opus-5-5');
    return { ok: true, claude: 'ok', ms: Date.now() - started };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return { ok: true, claude: env.keySet ? 'bad-key' : 'no-key' };
    return { ok: true, claude: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
