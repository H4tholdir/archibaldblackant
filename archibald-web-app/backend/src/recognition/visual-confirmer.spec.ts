import { describe, expect, test } from 'vitest'
import { parseConfirmationJson } from './visual-confirmer'

describe('parseConfirmationJson', () => {
  test('valid JSON → confirmation parsata correttamente', () => {
    const input = JSON.stringify({
      matched_family_code: 'H251',
      confidence: 0.93,
      reasoning: 'Cono tondo, anello rosso visibile sul gambo HP',
      runner_up: 'H253',
    })
    expect(parseConfirmationJson(input)).toEqual({
      matched_family_code: 'H251',
      confidence: 0.93,
      reasoning: 'Cono tondo, anello rosso visibile sul gambo HP',
      runner_up: 'H253',
    })
  })

  test('JSON in mezzo al testo → estrazione corretta', () => {
    const payload = {
      matched_family_code: 'H297',
      confidence: 0.88,
      reasoning: 'Fiamma con anello rosso',
      runner_up: null,
    }
    const raw = `Analisi completata.\n${JSON.stringify(payload)}\nFine.`
    const result = parseConfirmationJson(raw)
    expect(result.matched_family_code).toBe('H297')
    expect(result.confidence).toBe(0.88)
  })

  test('nessun match → matched_family_code null', () => {
    const input = JSON.stringify({
      matched_family_code: null,
      confidence: 0.25,
      reasoning: 'Nessuno dei candidati corrisponde',
      runner_up: null,
    })
    const result = parseConfirmationJson(input)
    expect(result.matched_family_code).toBeNull()
    expect(result.confidence).toBe(0.25)
  })

  test('JSON non valido → fallback con confidence=0 e matched=null', () => {
    const result = parseConfirmationJson('non è JSON')
    expect(result.confidence).toBe(0)
    expect(result.matched_family_code).toBeNull()
    expect(result.reasoning).toBe('parse error')
  })
})
