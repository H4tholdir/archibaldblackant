import { describe, expect, test } from 'vitest'
import { createCatalogVisionService } from './anthropic-vision-service'
import type { CatalogVisionServiceDeps } from './anthropic-vision-service'

describe('createCatalogVisionService', () => {
  test('returns object with identifyFromImage function', () => {
    const deps: CatalogVisionServiceDeps = {
      apiKey:    'test-key',
      timeoutMs: 30000,
    }
    const service = createCatalogVisionService(deps)
    expect(typeof service.identifyFromImage).toEqual('function')
  })
})
