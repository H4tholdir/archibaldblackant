import { describe, expect, test } from 'vitest'
import { parseIdentificationResult, createCatalogVisionService } from './anthropic-vision-service'
import type { CatalogVisionServiceDeps } from './anthropic-vision-service'

const DUMMY_USAGE   = { inputTokens: 100, outputTokens: 50 }
const PRODUCT_CODE  = '879.314.014'
const PRODUCT_CODE2 = '8879.314.016'

describe('parseIdentificationResult', () => {
  test('single product code → match with extracted code', () => {
    const text   = `I am confident this is product ${PRODUCT_CODE}.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result).toMatchObject({
      resultState: 'match',
      productCode: PRODUCT_CODE,
      familyCode:  '879',
      candidates:  [],
    })
  })

  test('two product codes → shortlist with both candidates', () => {
    const text   = `It could be ${PRODUCT_CODE} or possibly ${PRODUCT_CODE2}.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result).toMatchObject({
      resultState: 'shortlist',
      candidates:  [PRODUCT_CODE, PRODUCT_CODE2],
    })
  })

  test('no product code → not_found', () => {
    const text   = 'I cannot identify this instrument from the image.'
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result).toMatchObject({
      resultState: 'not_found',
      productCode: null,
      familyCode:  null,
      candidates:  [],
    })
  })

  test('text with "confident" → confidence >= 0.85', () => {
    const text   = `I am confident this is ${PRODUCT_CODE}.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  test('text with "uncertain" → confidence <= 0.6', () => {
    const text   = `I am uncertain, could be ${PRODUCT_CODE} or something else entirely.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result.confidence).toBeLessThanOrEqual(0.6)
  })

  test('catalogPage from lastCatalogPage parameter', () => {
    const catalogPage = 42
    const text        = `The instrument is ${PRODUCT_CODE}.`
    const result      = parseIdentificationResult(text, catalogPage, DUMMY_USAGE)
    expect(result.catalogPage).toEqual(catalogPage)
  })

  test('usage propagated to result', () => {
    const usage  = { inputTokens: 1234, outputTokens: 567 }
    const text   = `This is ${PRODUCT_CODE}.`
    const result = parseIdentificationResult(text, null, usage)
    expect(result.usage).toEqual(usage)
  })

  test('reasoning equals the full text', () => {
    const text   = `After analysis, I believe this is ${PRODUCT_CODE}. The shape is torpedo.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result.reasoning).toEqual(text)
  })

  test('duplicate product codes counted once → match not shortlist', () => {
    const text   = `This is ${PRODUCT_CODE}. I confirm: ${PRODUCT_CODE}.`
    const result = parseIdentificationResult(text, null, DUMMY_USAGE)
    expect(result.resultState).toEqual('match')
    expect(result.productCode).toEqual(PRODUCT_CODE)
  })
})

describe('createCatalogVisionService', () => {
  test('returns object with identifyFromImage function', () => {
    const deps: CatalogVisionServiceDeps = {
      apiKey:     'test-key',
      timeoutMs:  30000,
      pool:       {} as CatalogVisionServiceDeps['pool'],
      catalogPdf: {} as CatalogVisionServiceDeps['catalogPdf'],
    }
    const service = createCatalogVisionService(deps)
    expect(typeof service.identifyFromImage).toEqual('function')
  })
})
