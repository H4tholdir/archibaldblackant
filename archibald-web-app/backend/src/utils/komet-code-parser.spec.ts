import { describe, it, expect } from 'vitest'
import { parseKometFeatures } from './komet-code-parser'
import type { KometFeatures } from './komet-code-parser'

describe('parseKometFeatures', () => {
  it('restituisce null per codice senza punti', () => {
    expect(parseKometFeatures('H1314016')).toBeNull()
  })

  it('restituisce null per codice con meno di 3 parti', () => {
    expect(parseKometFeatures('H1.314')).toBeNull()
  })

  it('restituisce null per gambo sconosciuto', () => {
    expect(parseKometFeatures('H1.999.016')).toBeNull()
  })

  it('restituisce null per famiglia sconosciuta', () => {
    expect(parseKometFeatures('UNKNOWN.314.016')).toBeNull()
  })

  it('restituisce null per sizeCode non numerico', () => {
    expect(parseKometFeatures('H1.314.abc')).toBeNull()
  })

  it('parsifica H1.314.016 correttamente', () => {
    expect(parseKometFeatures('H1.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('parsifica H7.314.014 come testa a pera', () => {
    expect(parseKometFeatures('H7.314.014')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa a pera',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.4,
    })
  })

  it('parsifica H2.314.016 come cono rovesciato', () => {
    expect(parseKometFeatures('H2.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Cono rovesciato',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('parsifica H21R.314.016 come cilindro', () => {
    expect(parseKometFeatures('H21R.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Cilindro',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('parsifica H1.204.014 con contrangolo CA', () => {
    expect(parseKometFeatures('H1.204.014')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Contrangolo (CA)',
      shankDiameterMm: 2.35,
      headDiameterMm:  1.4,
    })
  })

  it('parsifica H1.313.016 con turbina corta FGS', () => {
    expect(parseKometFeatures('H1.313.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Turbina corta (FGS)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('calcola correttamente headDiameterMm da sizeCode 021', () => {
    expect(parseKometFeatures('H1.314.021')?.headDiameterMm).toBe(2.1)
  })

  it('calcola correttamente headDiameterMm da sizeCode 012', () => {
    expect(parseKometFeatures('H1.314.012')?.headDiameterMm).toBe(1.2)
  })

  it('parsifica 8801.314.016 con grana fine (anello rosso)', () => {
    expect(parseKometFeatures('8801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana fine (anello rosso)',
    })
  })

  it('parsifica 801UF.314.016 con grana ultra fine (anello bianco)', () => {
    expect(parseKometFeatures('801UF.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana ultra fine (anello bianco)',
    })
  })

  it('parsifica 801EF.314.016 con grana extra fine (anello giallo)', () => {
    expect(parseKometFeatures('801EF.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana extra fine (anello giallo)',
    })
  })

  it('parsifica 801.314.016 con grana standard (anello blu)', () => {
    expect(parseKometFeatures('801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana standard (anello blu)',
    })
  })

  it('parsifica 6801.314.016 con grana grossolana (anello verde)', () => {
    expect(parseKometFeatures('6801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana grossolana (anello verde)',
    })
  })

  it('parsifica KP6801.314.016 come DIAO oro-rosa', () => {
    expect(parseKometFeatures('KP6801.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata DIAO (oro-rosa)',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana grossolana (anello verde)',
    })
  })

  it('parsifica 879.314.016 come torpedine', () => {
    expect(parseKometFeatures('879.314.016')).toEqual<KometFeatures>({
      material:        'Diamantata',
      shape:           'Torpedine',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
      gritLabel:       'Grana standard (anello blu)',
    })
  })

  it('parsifica H1S come testa tonda (variante H1)', () => {
    expect(parseKometFeatures('H1S.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa tonda',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('parsifica H7S come testa a pera (variante H7)', () => {
    expect(parseKometFeatures('H7S.314.016')).toEqual<KometFeatures>({
      material:        'Carburo di tungsteno',
      shape:           'Testa a pera',
      shankType:       'Turbina (FG)',
      shankDiameterMm: 1.6,
      headDiameterMm:  1.6,
    })
  })

  it('NON include gritLabel per prodotti carburo di tungsteno', () => {
    const result = parseKometFeatures('H1.314.016')
    expect(result).not.toHaveProperty('gritLabel')
  })
})
