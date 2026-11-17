export type CheckState = 'pending' | 'ok' | 'fail';
export type CheckKey = 'camera' | 'wall' | 'server' | 'shadow';
export type CheckItem = { key: CheckKey; label: string; state: CheckState; detail: string };
export type Health = { ok: boolean; claude: 'ok' | 'no-key' | 'bad-key' | 'error'; ms?: number; message?: string; provider?: 'Claude' | 'Jev' };

const AUTO_HIDE_MS = 2000;
const LABELS: Record<CheckKey, string> = {
  camera: 'Camera',
  wall: 'Sees the wall',
  server: 'Recognition',
  shadow: 'Your shadow',
};
const HINTS: Record<CheckKey, string> = {
  camera: 'starting camera…',
  wall: 'point the camera at the wall, stay out of the beam, press C',
  server: 'checking the recognition server…',
  shadow: 'put your hand in the light…',
};

/** The on-wall setup checklist: camera, wall (calibration), recognition server, your shadow. */
export class Checklist {
  private state = new Map<CheckKey, { state: CheckState; detail: string }>();
  private readySince: number | null = null;

  constructor() {
    for (const k of Object.keys(LABELS) as CheckKey[]) this.state.set(k, { state: 'pending', detail: HINTS[k] });
  }

  private set(key: CheckKey, state: CheckState, detail: string, tMs = 0) {
    this.state.set(key, { state, detail });
    this.readySince = this.ready ? (this.readySince ?? tMs) : null;
  }

  camera(state: CheckState, detail: string, tMs = 0) { this.set('camera', state, detail, tMs); }
  server(state: CheckState, detail: string, tMs = 0) { this.set('server', state, detail, tMs); }
  shadow(state: CheckState, detail: string, tMs = 0) { this.set('shadow', state, detail, tMs); }
  /** A (re)calibration also means the shadow has to be seen again on the new mapping. */
  wall(state: CheckState, detail: string, tMs = 0) {
    this.state.set('shadow', { state: 'pending', detail: HINTS.shadow });
    this.set('wall', state, detail, tMs);
  }

  items(): CheckItem[] {
    return (Object.keys(LABELS) as CheckKey[]).map((key) => ({ key, label: LABELS[key], ...this.state.get(key)! }));
  }

  get ready(): boolean {
    return [...this.state.values()].every((s) => s.state === 'ok');
  }

  shouldAutoHide(tMs: number): boolean {
    return this.readySince !== null && tMs - this.readySince >= AUTO_HIDE_MS;
  }
}

/** Turn the server's /api/health answer (null = unreachable) into a checklist line. */
export function describeHealth(h: Health | null): [CheckState, string] {
  if (!h) return ['fail', 'Server not running — run: npm run server'];
  const who = h.provider ?? 'Claude';
  if (who === 'Jev' && h.claude === 'bad-key') return ['fail', 'OpenRouter key rejected — check OPENROUTER_API_KEY (openrouter.ai/settings/keys)'];
  switch (h.claude) {
    case 'ok': return ['ok', `${who} connected (${h.ms} ms)`];
    case 'no-key': return ['fail', 'No API key in the server’s terminal — run: export ANTHROPIC_API_KEY=sk-ant-…  then npm run server'];
    case 'bad-key': return ['fail', 'API key rejected — it may be incomplete or revoked; make a new one at console.anthropic.com'];
    default: return ['fail', `Can't reach ${who}: ${h.message ?? 'unknown error'}`];
  }
}
