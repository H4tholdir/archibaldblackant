import { describe, it, expect } from 'vitest'
import { computePxPerMm } from './aruco-compute'

describe('computePxPerMm', () => {
  it('calcola 5.0 px/mm da quadrato perfetto 100px su marker 20mm', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    expect(computePxPerMm(corners)).toBeCloseTo(5.0, 2)
  })

  it('calcola correttamente da quadrato ruotato (lato = diagonale/sqrt2)', () => {
    const d = 100
    const corners = [{ x: d, y: 0 }, { x: 2 * d, y: d }, { x: d, y: 2 * d }, { x: 0, y: d }]
    expect(computePxPerMm(corners)).toBeCloseTo((d * Math.SQRT2) / 20, 2)
  })

  it('media i 4 lati per robustezza al rumore di rilevazione', () => {
    const corners = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 101, y: 99  },
      { x: 1,   y: 100 },
    ]
    const sides = [
      Math.hypot(100, 0),
      Math.hypot(1, 99),
      Math.hypot(100, 1),
      Math.hypot(1, 100),
    ]
    const expected = sides.reduce((a, b) => a + b, 0) / 4 / 20.0
    expect(computePxPerMm(corners)).toBeCloseTo(expected, 5)
  })
})
