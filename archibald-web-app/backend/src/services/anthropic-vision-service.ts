import Anthropic from '@anthropic-ai/sdk';
import type { InstrumentFeatures } from '../recognition/types';

const VISION_PROMPT = `You are a dental rotary instrument identification system specialized in Komet burs.
Analyze only the LARGEST or MOST CENTERED instrument if multiple are visible.
Return all fields as null with confidence 0 if no dental instrument is visible.

SHAPE FAMILIES (choose one):
round           — spherical head
pear            — pear/egg shape, wider at top, tapers down
inverted_cone   — wider at tip, narrows toward shank
cylinder        — straight cylinder, flat ends
cylinder_round_end — cylinder with ONE rounded end (tip), flat base
tapered_round_end  — gently tapers toward a ROUNDED tip (like a bullet)
tapered_flat_end   — tapers toward a FLAT tip (like a truncated cone)
flame           — elongated, tapers to a sharp pointed tip
torpedo         — cylindrical body with BOTH ends rounded/tapered symmetrically
diabolo         — double-cone, narrow in the middle
wheel           — disc/wheel shape
egg             — oval/egg shape
bud             — small rounded bud shape
double_cone     — two cones joined at base
other           — none of the above

MATERIALS:
tungsten_carbide — silver/grey, VISIBLE CUTTING FLUTES or cross-cut pattern on head
diamond          — rough, matte grey/dark abrasive texture on head (no visible flutes)
diamond_diao     — ROSE GOLD / pink-gold color — very distinctive
steel            — bright silver, completely SMOOTH head (no texture, no flutes)
ceramic          — white or ivory colored head
polymer          — rubber-like, matte, various colors
sonic_tip        — flat metal wedge or triangle shape
ultrasonic       — extremely fine metal tip, no visible working surface texture

GRIT RING COLORS — for diamond instruments ONLY:
A thin colored band sits at the BASE of the head where it meets the shank neck.
IMPORTANT: The ultrafine ring is nearly transparent/white and easy to miss.
  white  (ultra_fine)  — VERY FAINT, almost invisible pale band. If you see a tiny pale ring, choose white NOT none.
  yellow (extra_fine)  — pale yellow band
  red    (fine)        — distinct red or orange-red band
  blue   (standard)    — distinct blue band — the MOST COMMON
  green  (coarse)      — distinct green band
  black  (super_coarse)— dark or black band
  none   — truly NO ring at all (rare; only for special instruments without any grit coding)
Default to "blue" if you see a diamond instrument with no clearly visible ring color.

SHANK TYPES — LENGTH IS THE PRIMARY DISTINGUISHING FEATURE:
The shank is the smooth cylindrical handle part that goes into the handpiece.

  fg   — Friction Grip. Thin (~1.6mm). SHORT: total instrument ≈22-24mm.
         The head takes up roughly 25-40% of the total visible length.
         If held between fingers near the middle, roughly equal length on both sides.

  ca   — Contra-angle. Slightly thicker (~2.35mm). SHORT to MEDIUM (≈22-26mm total).
         KEY IDENTIFIER: a visible NOTCH or LATCH GROOVE at the very end of the shank.
         Without the notch, it looks like a short HP.

  hp   — Handpiece/straight. LONG shank (~2.35mm, same as CA but NO latch notch).
         Total instrument ≈47-52mm standard, up to 70mm extra-long.
         CRITICAL: if held near the head, most of the shank extends well below the fingers.
         The head appears SMALL relative to the long shank. Shank is 5-10× longer than head.
         FG vs HP: if fingers holding the instrument are near the TOP (head end), it is HP.

  grip — Large plastic or rubber handle, clearly wider (≥3mm), finger-held.
  unmounted — No shank, only the working head is visible.
  unknown — Shank not clearly visible.

SHANK LENGTH CATEGORY — estimate from the image:
  short      — total instrument ≤24mm (typical FG, CA)
  medium     — 25-35mm (FG long, FG extra-long, CA long, HPS short handpiece)
  long       — 36-55mm (standard HP, 44.5mm)
  extra_long — >55mm (HP long 65mm, HP extra-long 70mm)

HEAD-TO-SHANK RATIO:
head_shank_ratio: widest point of HEAD divided by widest point of SHANK (as decimal).
Examples: head twice as wide as shank = 2.0, same width = 1.0, narrower = 0.8.
Set to null only if shank not visible at all.

Respond with ONLY valid JSON, no markdown, no extra text:
{
  "shape_family": "...",
  "material": "...",
  "grit_ring_color": "...",
  "shank_type": "...",
  "shank_length_category": "...",
  "head_shank_ratio": null,
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
          model:      'claude-haiku-4-5-20251001',
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

      const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
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
