import type { DbPool } from '../db/pool'

export type VisionApiFn = (imageBase64: string, signal?: AbortSignal) => Promise<import('../recognition/types').IdentificationResult>

export type CatalogVisionServiceDeps = {
  apiKey:    string
  timeoutMs: number
  pool:      DbPool
}

export function createCatalogVisionService(_deps: CatalogVisionServiceDeps): import('../recognition/recognition-engine').CatalogVisionService {
  // TODO: implementare in Task 6 — Sonnet tool use con search_catalog + get_catalog_page
  throw new Error('CatalogVisionService not yet implemented')
}
