import { describe, expect, it, vi } from 'vitest';
import { planCommand, simplePlan, validPlan, type SceneItem } from '../../server/command';

const wall: SceneItem[] = [
  { id: 'd1', label: 'plane', x: 0.8, y: 0.3, zone: 'sky' },
  { id: 'd2', label: 'fish', x: 0.7, y: 0.9, zone: 'water' },
  { id: 'd3', label: 'cat', x: 0.75, y: 0.8, zone: 'ground', selected: true },
];

describe('voice commands', () => {
  it('keeps only real drawings and known actions', () => {
    const p = validPlan({ story: 'Off they go!', steps: [
      { do: 'goto', who: 'd1', place: 'ground' },
      { do: 'goto', who: 'd2', near: 'd1' },
      { do: 'ride', who: 'd2', on: 'd1' },
      { do: 'leave', who: 'd1', side: 'right' },
      { do: 'explode', who: 'd1' }, // unknown action
      { do: 'say', who: 'zz', text: 'hi' }, // nobody
      { do: 'trick', who: 'd3', kind: 'teleport' }, // unknown trick
    ] }, wall)!;
    expect(p.story).toBe('Off they go!');
    expect(p.steps.map((s) => s.do)).toEqual(['goto', 'goto', 'ride', 'leave']);
  });
  it('asks the model with the wall and the words, and acts on its script', async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('anthropic/claude-haiku-5.5');
      expect(body.messages[1].content).toContain('d2: a fish in the water');
      expect(body.messages[1].content).toContain('(selected)');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Here: {"story":"The plane lands.","steps":[{"do":"goto","who":"d1","place":"ground"}]}' } }] }));
    });
    const p = await planCommand('the plane lands', wall, 'key', fetchFn as unknown as typeof fetch);
    expect(p.story).toBe('The plane lands.');
    expect(p.steps).toEqual([{ do: 'goto', who: 'd1', place: 'ground', above: false, ms: 1600 }]);
  });
  it('without a key (or if the model fails), plain phrases still work', async () => {
    expect(simplePlan('the cat jumps', wall).steps).toEqual([{ do: 'trick', who: 'd3', kind: 'jump' }]);
    expect(simplePlan('the fish swims over to the plane', wall).steps[0]).toMatchObject({ do: 'goto', who: 'd2', near: 'd1' });
    expect(simplePlan('make it dance', wall).steps).toEqual([{ do: 'trick', who: 'd3', kind: 'spin' }]); // "it" = selected
    const failing = vi.fn(async () => new Response('nope', { status: 500 }));
    const p = await planCommand('the cat jumps', wall, 'key', failing as unknown as typeof fetch);
    expect(p.steps[0]).toMatchObject({ do: 'trick', who: 'd3' });
    expect(p.note).toMatch(/error 500/);
  });
});
