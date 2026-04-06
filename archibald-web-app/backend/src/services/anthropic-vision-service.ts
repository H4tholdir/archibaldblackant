import Anthropic from '@anthropic-ai/sdk';
import type { InstrumentFeatures } from '../recognition/types';

const VISION_PROMPT = `You are a dental instrument identification system.
If multiple instruments are visible, analyze only the LARGEST or MOST CENTERED one.
If no dental instrument is visible, return all fields as null with confidence: 0.
Analyze the photo and extract the following features as JSON.
Be precise. If you cannot determine a field with confidence, set it to null.

SHAPE FAMILIES (choose one):
round, pear, inverted_cone, cylinder, cylinder_round_end, tapered_round_end,
tapered_flat_end, flame, torpedo, diabolo, wheel, egg, bud, double_cone, other

MATERIALS:
tungsten_carbide (silver/grey metallic with visible flutes/cross-cut)
diamond (rough grey texture, abrasive surface)
diamond_diao (ROSE GOLD color - very distinctive)
steel (bright silver, smooth)
ceramic (white/ivory)
polymer (rubber-like, various colors)
sonic_tip (metal, specific wedge/triangle shapes)
ultrasonic (very fine tips)

GRIT RING COLORS (for diamond instruments only):
white (ultra_fine), yellow (extra_fine), red (fine), blue (standard),
green (coarse), black (super_coarse), none (no visible ring)

SHANK TYPES:
fg (thin smooth shank, ~1.6mm diameter, goes into turbine/high-speed handpiece)
ca (thicker shank, ~2.35mm, with latch groove/slot at the end, contra-angle handpiece)
hp (thicker smooth shank, ~2.35mm, NO latch groove, straight handpiece — visually similar to ca but no groove)
grip (large colored plastic or rubber handle, ~4mm, finger-held — clearly much wider than metal shanks)
unmounted (no shank, just the bur head/working part visible)
unknown (shank not clearly visible or ambiguous)

PIXEL MEASUREMENTS:
head_px: width of the instrument HEAD in pixels (the working/cutting part)
shank_px: width of the SHANK (handle part) in pixels
Measure at the widest point. Set to null if not clearly visible.

Respond with ONLY this JSON, no other text:
{
  "shape_family": "...",
  "material": "...",
  "grit_ring_color": "...",
  "shank_type": "...",
  "head_px": null,
  "shank_px": null,
  "confidence": 0.0
}`;

type VisionServiceDeps = {
  apiKey:    string
  timeoutMs: number
};

type VisionApiFn = (imageBase64: string, externalSignal?: AbortSignal) => Promise<InstrumentFeatures>;

function createVisionService(deps: VisionServiceDeps): VisionApiFn {
  const client = new Anthropic({ apiKey: deps.apiKey });

  return async function callVisionApi(imageBase64: string, externalSignal?: AbortSignal): Promise<InstrumentFeatures> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);

    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await client.messages.create(
        {
          model:      'claude-haiku-4-5',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type:   'image',
                  source: {
                    type:       'base64',
                    media_type: 'image/jpeg' as const,
                    data:       imageBase64,
                  },
                },
                { type: 'text', text: VISION_PROMPT },
              ],
            },
          ],
        },
        { signal: controller.signal },
      );

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const parsed = JSON.parse(text) as InstrumentFeatures;
      return parsed;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  };
}

export { createVisionService };
export type { VisionApiFn };
