import { describe, expect, it } from 'vitest';
import { describeHealth } from '../../src/setup/checklist';

describe('describeHealth', () => {
  it('server down', () => expect(describeHealth(null)).toEqual(['fail', 'Server not running — run: npm run server']));
  it('no key', () => expect(describeHealth({ ok: true, claude: 'no-key' })[1]).toMatch(/ANTHROPIC_API_KEY/));
  it('bad key', () => expect(describeHealth({ ok: true, claude: 'bad-key' })[1]).toMatch(/rejected/));
  it('ok', () => expect(describeHealth({ ok: true, claude: 'ok', ms: 412 })).toEqual(['ok', 'Claude connected (412 ms)']));
});
