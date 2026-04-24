import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import { logger } from '../logger'

type IdentificationResult = {
  productCode:   string | null
  familyCode:    string | null
  confidence:    number
  resultState:   'match' | 'shortlist' | 'not_found'
  candidates:    string[]
  catalogPage:   number | null
  reasoning:     string
  photo_request: string | null
  usage:         { inputTokens: number; outputTokens: number }
}

type CandidateWithImages = {
  familyCode:      string
  description:     string
  referenceImages: string[]
}

type CatalogVisionService = {
  identifyFromImage: (photos: string[], candidates: CandidateWithImages[], signal?: AbortSignal) => Promise<IdentificationResult>
}

export type CatalogVisionServiceDeps = {
  apiKey:    string
  timeoutMs: number
}

const SYSTEM_PROMPT = `You are identifying a Komet dental instrument from a photo taken by a dental sales agent.

The vector search system has pre-selected the top-10 most visually similar families from our catalog.
Each candidate includes a family code and one or more reference images.

STEP 1 — Eliminate candidates whose overall shape is clearly different from the query photo.
STEP 2 — Among remaining candidates, identify the closest match by comparing:
  • Shape, proportions, and body profile
  • Tip geometry and apex
  • Shank characteristics (length, presence of collar/notch)
  Trust visual comparison over text classification.
STEP 3 — Submit with honest confidence using submit_identification.

Confidence guide:
  ≥ 0.85 : shape clearly matches one candidate → product_code = "FAMILY.SHANK.SIZE", empty candidates[]
  0.65–0.84 : probable match, some uncertainty → product_code = "", list 2–3 in candidates[]
  < 0.65 : genuinely uncertain → product_code = "", list 2–3 in candidates[]

Rules:
  • Do NOT force a definitive match when uncertain.
  • Do NOT add candidates not in the provided list.
  • When uncertain after one photo, add photo_request with a specific Italian instruction
    for the photo that would best resolve your uncertainty.`

const SUBMIT_IDENTIFICATION_TOOL: Anthropic.Tool = {
  name:        'submit_identification',
  description: 'Submit your identification result. Call exactly once after completing visual comparison.',
  input_schema: {
    type:     'object' as const,
    required: ['product_code', 'confidence', 'reasoning'],
    properties: {
      product_code: {
        type:        'string',
        description: 'Product code "FAMILY.SHANK.SIZE" (e.g. "879.104.014"), or "" if uncertain',
      },
      candidates: {
        type:        'array',
        items:       { type: 'string' },
        description: '2–3 candidate codes when uncertain (e.g. ["879.104.014","863.104.014"])',
      },
      confidence: { type: 'number', description: 'Confidence score 0.0–1.0' },
      reasoning:  { type: 'string', description: 'Brief reasoning in English' },
      photo_request: {
        type:        'string',
        description: 'Optional Italian instruction for the specific additional photo that would resolve uncertainty. Omit if confident.',
      },
    },
  },
}

export function createCatalogVisionService(deps: CatalogVisionServiceDeps): CatalogVisionService {
  const client = new Anthropic({ apiKey: deps.apiKey })
  return {
    identifyFromImage: (photos, candidates, signal) =>
      identifyFromImage(client, photos, candidates, signal),
  }
}

async function identifyFromImage(
  client:     Anthropic,
  photos:     string[],
  candidates: CandidateWithImages[],
  signal?:    AbortSignal,
): Promise<IdentificationResult> {
  const messages: MessageParam[] = [
    { role: 'user', content: buildUserMessage(photos, candidates) },
  ]

  let inputTokensTotal = 0, outputTokensTotal = 0

  for (let iter = 0; iter < 2; iter++) {
    const response = await client.messages.create(
      { model: 'claude-sonnet-4-6', max_tokens: 1024, system: SYSTEM_PROMPT, tools: [SUBMIT_IDENTIFICATION_TOOL], messages },
      { signal },
    )

    inputTokensTotal  += response.usage.input_tokens
    outputTokensTotal += response.usage.output_tokens

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (toolUse?.type === 'tool_use') {
      return parseSubmitResult(toolUse.input, { inputTokens: inputTokensTotal, outputTokens: outputTokensTotal })
    }

    if (response.stop_reason === 'end_turn') break

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: 'Please call submit_identification now with your best assessment.' })
  }

  logger.warn('[vision-service] No submit_identification tool call received')
  return {
    productCode: null, familyCode: null, confidence: 0, resultState: 'not_found',
    candidates: [], catalogPage: null, reasoning: 'No tool call received',
    photo_request: null,
    usage: { inputTokens: inputTokensTotal, outputTokens: outputTokensTotal },
  }
}

function buildUserMessage(
  photos:     string[],
  candidates: CandidateWithImages[],
): Anthropic.MessageParam['content'] {
  const content: Anthropic.MessageParam['content'] = []

  for (const [i, photo] of photos.entries()) {
    content.push({ type: 'text', text: i === 0 ? 'Query photo (primary):' : 'Query photo (secondary angulation):' })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } })
  }

  content.push({ type: 'text', text: `\nTop-${candidates.length} candidate families:\n` })

  for (const candidate of candidates) {
    content.push({ type: 'text', text: `\nCandidate: ${candidate.familyCode} — ${candidate.description}` })
    for (const img of candidate.referenceImages) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } })
    }
  }

  content.push({ type: 'text', text: '\nCall submit_identification with your result.' })
  return content
}

function parseSubmitResult(
  input: unknown,
  usage: { inputTokens: number; outputTokens: number },
): IdentificationResult {
  const raw = input as {
    product_code:   string
    candidates?:    string[]
    confidence:     number
    reasoning:      string
    photo_request?: string
  }

  const productCode = raw.product_code?.trim() || null
  const familyCode  = productCode ? (productCode.split('.')[0] ?? null) : null
  const candidates  = raw.candidates ?? []
  const hasMatch    = !!productCode && raw.confidence >= 0.85

  return {
    productCode, familyCode,
    confidence:    raw.confidence,
    resultState:   hasMatch ? 'match' : (candidates.length > 0 ? 'shortlist' : 'not_found'),
    candidates,
    catalogPage:   null,
    reasoning:     raw.reasoning,
    photo_request: raw.photo_request ?? null,
    usage,
  }
}
