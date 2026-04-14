import { describe, test, expect } from 'vitest'
import { matchesTrigger } from './promotion'
import type { TriggerRule } from './promotion'

describe('matchesTrigger', () => {
  describe('type: contains', () => {
    test('matcha sottostringa case-insensitive (trigger maiuscolo, articolo maiuscolo)', () => {
      const rules: TriggerRule[] = [{ type: 'contains', value: 'SF' }]
      expect(matchesTrigger('SF10L.000.', rules)).toBe(true)
    })

    test('matcha sottostringa case-insensitive (trigger minuscolo, articolo maiuscolo)', () => {
      const rules: TriggerRule[] = [{ type: 'contains', value: 'sf' }]
      expect(matchesTrigger('SF10L.000.', rules)).toBe(true)
    })

    test('matcha sottostringa case-insensitive (trigger maiuscolo, articolo minuscolo)', () => {
      const rules: TriggerRule[] = [{ type: 'contains', value: 'SF' }]
      expect(matchesTrigger('sf10l.000.', rules)).toBe(true)
    })

    test('non matcha se il valore non è presente', () => {
      const rules: TriggerRule[] = [{ type: 'contains', value: 'XY' }]
      expect(matchesTrigger('SF10L.000.', rules)).toBe(false)
    })
  })

  describe('type: exact', () => {
    test('matcha codice esatto (stesso case)', () => {
      const rules: TriggerRule[] = [{ type: 'exact', value: 'CERC.314.014' }]
      expect(matchesTrigger('CERC.314.014', rules)).toBe(true)
    })

    test('non matcha codice esatto con case diverso', () => {
      const rules: TriggerRule[] = [{ type: 'exact', value: 'CERC.314.014' }]
      expect(matchesTrigger('cerc.314.014', rules)).toBe(false)
    })

    test('non matcha sottostringa in exact mode', () => {
      const rules: TriggerRule[] = [{ type: 'exact', value: 'SF' }]
      expect(matchesTrigger('SF10L.000.', rules)).toBe(false)
    })
  })

  test('ritorna true se almeno una rule matcha', () => {
    const rules: TriggerRule[] = [
      { type: 'contains', value: 'XY' },
      { type: 'contains', value: 'sf' },
    ]
    expect(matchesTrigger('SF10L.000.', rules)).toBe(true)
  })

  test('ritorna false con array regole vuoto', () => {
    expect(matchesTrigger('SF10L.000.', [])).toBe(false)
  })
})
