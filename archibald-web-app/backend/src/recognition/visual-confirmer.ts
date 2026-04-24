import { readFile } from 'node:fs/promises'
import Anthropic from '@anthropic-ai/sdk'
import type { CatalogCandidate, VisualConfirmation } from './types'
import { logger } from '../logger'

const CONFIRMER_MODEL = 'claude-opus-4-7'

const CONFIRM_PROMPT = `You are a dental bur identification expert. A photo of an instrument is shown, followed by numbered reference images from a product catalog.

Identify which reference matches the instrument. Compare:
- Head shape (ball, cone, cylinder, flame, etc.) and proportions
- Shank type visible
- Grit indicator: colored ring on shaft, blade pattern, or head/body color
- Surface texture (diamond grit, cutting blades, rubber, etc.)

Return ONLY this JSON:
{
  "matched_family_code": <string family code or null>,
  "confidence": <float 0.0-1.0>,
  "reasoning": <one concise sentence>,
  "runner_up": <string or null>
}

If confidence < 0.85, set matched_family_code to null.`

export async function confirmWithOpus(
  client: Anthropic,
  photoBase64: string,
  candidates: CatalogCandidate[],
): Promise<VisualConfirmation> {
  const images = await loadImages(candidates)

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: 'Photo of the instrument to identify:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoBase64 } },
  ]

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!
    content.push({ type: 'text', text: `Reference ${i + 1}: ${candidate.familyCode}` })
    const img = images[i]
    if (img) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })
    }
  }

  content.push({ type: 'text', text: CONFIRM_PROMPT })

  const message = await client.messages.create({
    model: CONFIRMER_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content }],
  })

  const text = message.content.find(b => b.type === 'text')?.text ?? ''
  return parseConfirmationJson(text)
}

export function parseConfirmationJson(raw: string): VisualConfirmation {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fallbackConfirmation()
  try {
    return JSON.parse(match[0]) as VisualConfirmation
  } catch {
    return fallbackConfirmation()
  }
}

function fallbackConfirmation(): VisualConfirmation {
  return { matched_family_code: null, confidence: 0, reasoning: 'parse error', runner_up: null }
}

async function loadImages(candidates: CatalogCandidate[]): Promise<(string | null)[]> {
  return Promise.all(
    candidates.map(async candidate => {
      if (!candidate.thumbnailPath) return null
      try {
        const buf = await readFile(candidate.thumbnailPath)
        return buf.toString('base64')
      } catch {
        logger.warn('[visual-confirmer] immagine candidato non trovata', {
          familyCode: candidate.familyCode,
          path: candidate.thumbnailPath,
        })
        return null
      }
    }),
  )
}
