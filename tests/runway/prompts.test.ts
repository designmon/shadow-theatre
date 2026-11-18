import { describe, expect, it } from 'vitest';
import { drawingPrompt, scenePrompt } from '../../src/runway/prompts';

describe('Runway prompts', () => {
  it('a drawing: what it is, what it does, and the style rules', () => {
    expect(drawingPrompt('butterfly', 'fly')).toBe('The hand-drawn butterfly comes alive and flutters its wings. Keep the exact same single-line drawing style and line thickness, plain white background, no shading, no colour, no new objects, static camera.');
    expect(drawingPrompt('something', 'float')).toMatch(/^The hand-drawn doodle comes alive and gently floats\./);
    expect(drawingPrompt('zebra', 'walk')).toMatch(/zebra comes alive and walks a few steps/); // unknown label: by motion
  });
  it('a scene: a flyer lands on the flower; the rest do their own thing', () => {
    const p = scenePrompt([{ label: 'flower', motion: 'sway' }, { label: 'butterfly', motion: 'fly' }, { label: 'dog', motion: 'walk' }]);
    expect(p).toBe('These hand-drawn line drawings come alive together: the butterfly flutters over and lands on the flower; the flower sways gently in the breeze; the dog trots happily, wagging its tail. Same line style, plain white background, nothing new added, static camera.');
  });
  it('a scene with two of the same: first and second', () => {
    expect(scenePrompt([{ label: 'cat', motion: 'walk' }, { label: 'cat', motion: 'walk' }])).toMatch(/the first cat walks .*; the second cat walks/);
  });
});
