import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Recognition } from '../src/types';

const Side = z.enum(['left', 'right', 'up', 'down']);
export const RecognitionSchema = z.object({
  kind: z.enum(['dog', 'rabbit', 'butterfly', 'swan', 'heart', 'unknown']),
  confidence: z.number().describe('0 to 1'),
  facing: Side.describe('direction the head (or, for the butterfly, the top of the wings) points in the image'),
  anchor: z.object({ x: z.number(), y: z.number() }).describe("the creature's head in the image, as fractions 0..1 of width and height (butterfly: body center)"),
});

export const UNKNOWN: Recognition = { kind: 'unknown', confidence: 0, facing: 'right', anchor: { x: 0.5, y: 0.5 } };
const MIN_CONFIDENCE = 0.5;
/** Fail fast: the browser gives up at 6 s, so don't keep retrying (and billing) after that. */
export const CLIENT_OPTIONS = { timeout: 6000, maxRetries: 0 };

const SYSTEM = `You look at hand shadows. The image is a black silhouette on white, cast on a wall by a person's hands and forearm in a shadow-puppet show. A wrist or forearm may extend to the image edge.

Classify it as exactly one of:
- dog: the classic dog head made with one or two hands; the mouth may be open or closed; ear on top, snout pointing sideways.
- rabbit: two upright fingers as long ears above a rounded head.
- butterfly: two hands joined at the hooked thumbs, fingers spread as two pairs of wings.
- swan: the forearm held upright as a long neck, the hand bent at the wrist as head and beak.
- heart: two hands forming a heart, curled fingers as the two round lobes on top, thumbs meeting in the point at the bottom.
- unknown: anything else, or if you are not reasonably sure.

Hand shadows are rough; judge the overall gesture, not fine detail. Give confidence from 0 to 1.`;

/** The slice of the Anthropic client this module needs (real client or a test fake). */
export type RecognizeClient = { beta: { messages: { parse: (params: any) => Promise<{ stop_reason: string | null; parsed_output?: unknown }> } } };

export async function handleRecognize(png: Buffer, client: RecognizeClient): Promise<Recognition> {
  try {
    const msg = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(RecognitionSchema) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } },
          { type: 'text', text: 'Which shadow puppet is this?' },
        ],
      }],
    });
    if (msg.stop_reason === 'refusal' || !msg.parsed_output) return UNKNOWN;
    const rec = RecognitionSchema.parse(msg.parsed_output) as Recognition;
    return rec.confidence < MIN_CONFIDENCE ? { ...rec, kind: 'unknown' } : rec;
  } catch (err) {
    console.error('[recognize] failed:', err instanceof Error ? err.message : err);
    return UNKNOWN;
  }
}
