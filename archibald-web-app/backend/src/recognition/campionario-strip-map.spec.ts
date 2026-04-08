import { describe, expect, test } from 'vitest'
import { findRelevantStrips } from './campionario-strip-map'

describe('findRelevantStrips', () => {
  test('863 vs 879 HP → MTB457 strip 06 first (shows both)', () => {
    const strips = findRelevantStrips(['863', '879'])
    expect(strips[0]?.path).toContain('mtb457-particolare-06')
    expect(strips[0]?.families).toContain('863')
    expect(strips[0]?.families).toContain('879')
  })

  test('863 vs 879 HP → at most 2 strips returned', () => {
    const strips = findRelevantStrips(['863', '879'])
    expect(strips.length).toBeLessThanOrEqual(2)
  })

  test('807 alone → MTB457 strip 02 (inverted cone)', () => {
    const strips = findRelevantStrips(['807'])
    expect(strips[0]?.path).toContain('mtb457-particolare-02')
  })

  test('unknown family → empty result', () => {
    const strips = findRelevantStrips(['XXXX'])
    expect(strips).toEqual([])
  })

  test('858 vs 859 → strip covering both returned', () => {
    const strips = findRelevantStrips(['858', '859'])
    // Both lance families appear together in MTB541-20 and MTB457-03
    expect(strips.length).toBeGreaterThanOrEqual(1)
    expect(strips[0]?.families).toContain('858')
  })

  test('no duplicate strips in result', () => {
    const strips = findRelevantStrips(['863', '862', '879'])
    const paths = strips.map(s => s.path)
    expect(paths).toEqual([...new Set(paths)])
  })

  test('second strip covers a candidate not in first strip', () => {
    // 801 (sphere) and 863 (flame) are in different strips
    const strips = findRelevantStrips(['801', '863'])
    const coveredFamilies = strips.flatMap(s => s.families)
    expect(coveredFamilies).toContain('801')
    expect(coveredFamilies).toContain('863')
  })
})
