import Anthropic from '@anthropic-ai/sdk'
import type { InstrumentDescriptor, ShankGroup } from './types'

export const INSTRUMENT_DESCRIPTOR_MODEL =
  process.env.INSTRUMENT_DESCRIPTOR_MODEL ?? 'claude-haiku-4-5-20251001'

const SHANK_DIAMETER_MM: Partial<Record<ShankGroup, number>> = {
  FG:       1.60,
  CA_HP:    2.35,
  HPT:      3.00,
  Handle_S: 4.00,
  Handle_L: 6.00,
}

const PROMPT = `You are a dental instrument classifier. Analyze the dental bur/instrument in the image and return ONLY a JSON object with exactly these fields:

{
  "shank": {
    "diameter_group": <"FG"|"CA_HP"|"HPT"|"Handle_S"|"Handle_L"|"none"|"unknown">,
    "diameter_px": <integer: width of shank shaft in pixels>,
    "length_px": <integer: visible shank length in pixels>
  },
  "head": {
    "diameter_px": <integer: maximum width of working head in pixels>,
    "length_px": <integer: length of working head in pixels>
  },
  "shape_class": <"sfera"|"ovale"|"pera"|"fiamma"|"ago"|"cilindro_piatto"|"cilindro_tondo"|"cono_piatto"|"cono_tondo"|"cono_invertito"|"disco"|"diabolo"|"altro">,
  "grit_indicator": {
    "type": <"ring_color"|"blade_count"|"head_color"|"none"|"unknown">,
    "color": <"white"|"yellow"|"red"|"none"|"green"|"black"|"blue"|"other"|null>,
    "blade_density": <"few_coarse"|"medium"|"many_fine"|null>
  },
  "surface_texture": <"diamond_grit"|"carbide_blades"|"ceramic"|"rubber_polisher"|"abrasive_wheel"|"disc_slotted"|"disc_perforated"|"steel_smooth"|"sonic_tip"|"other">,
  "confidence": <float 0.0-1.0>
}

SHANK GROUPS (ISO physical diameters):
- FG (1.60mm): thin shaft for air-turbine handpieces
- CA_HP (2.35mm): standard shaft for contra-angle and straight handpieces
- HPT (3.00mm): thick shaft for thick handpieces
- Handle_S (4.00mm): short grip/handle instrument
- Handle_L (6.00mm): large grip/handle instrument
- none: non-mounted bur (no shank)
- unknown: cannot determine

SHAPE CLASSES: sfera=ball, ovale=oval, pera=pear, fiamma=flame/torpedo, ago=needle, cilindro_piatto=flat-end cylinder, cilindro_tondo=round-end cylinder, cono_piatto=flat-end cone, cono_tondo=round-end cone, cono_invertito=inverted cone (wider at tip), disco=disc/wheel, diabolo=hourglass, altro=other

GRIT INDICATOR (physical colored ring/marking on instrument):
- ring_color: colored band on shaft neck; color = white(ultrafine) / yellow(extrafine) / red(fine) / none(medium, NO ring) / green(coarse) / black(super-coarse)
- blade_count: visible cutting flutes/blades; color=null, set blade_density
- head_color: color of rubber/polisher body; color=null
- none: no grit indicator

Return ONLY the JSON, no explanation.`

export async function describeInstrument(
  client:      Anthropic,
  imageBase64: string,
  pxPerMm:     number | null,
): Promise<InstrumentDescriptor> {
  const promptText = pxPerMm != null
    ? `${PROMPT}\n\nCALIBRATION: px_per_mm=${pxPerMm.toFixed(3)} (ARUco marker detected).`
    : PROMPT

  const message = await client.messages.create({
    model:      INSTRUMENT_DESCRIPTOR_MODEL,
    max_tokens: 512,
    messages: [{
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text',  text: promptText },
      ],
    }],
  })

  const text = message.content.find(b => b.type === 'text')?.text ?? ''
  return parseDescriptorJson(text)
}

export function parseDescriptorJson(raw: string): InstrumentDescriptor {
  const trimmed = raw.trim()
  try { return JSON.parse(trimmed) as InstrumentDescriptor } catch {}
  const start = raw.indexOf('{')
  if (start === -1) return fallbackDescriptor()
  let depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return fallbackDescriptor()
  try { return JSON.parse(raw.slice(start, end + 1)) as InstrumentDescriptor } catch {}
  return fallbackDescriptor()
}

function fallbackDescriptor(): InstrumentDescriptor {
  return {
    shank:           { diameter_group: 'unknown', diameter_px: 0, length_px: 0 },
    head:            { diameter_px: 0, length_px: 0 },
    shape_class:     'altro',
    grit_indicator:  { type: 'unknown', color: null, blade_density: null },
    surface_texture: 'other',
    confidence:      0,
  }
}

export function computePxPerMm(
  descriptor: InstrumentDescriptor,
  arucoMm:   number | null,
): number | null {
  if (arucoMm != null) return arucoMm
  const diamMm = SHANK_DIAMETER_MM[descriptor.shank.diameter_group]
  if (diamMm == null || descriptor.shank.diameter_px <= 0) return null
  return descriptor.shank.diameter_px / diamMm
}
