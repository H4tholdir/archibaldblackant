import { describe, expect, test } from 'vitest';
import { parseKometCode, calculateHeadSizeMm } from './komet-code-parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

function tc(shape: string, overrides: Partial<ReturnType<typeof parseKometCode>> = {}) {
  return expect.objectContaining({
    material: 'tungsten_carbide',
    grit_ring_color: null,
    shape_family: shape,
    ...overrides,
  })
}

function diamond(shape: string, grit: string | null, overrides: Partial<ReturnType<typeof parseKometCode>> = {}) {
  return expect.objectContaining({
    material: 'diamond',
    shape_family: shape,
    grit_ring_color: grit,
    ...overrides,
  })
}

function diao(shape: string, grit: string | null) {
  return expect.objectContaining({ material: 'diamond_diao', shape_family: shape, grit_ring_color: grit })
}

// ─── parseKometCode ──────────────────────────────────────────────────────────

describe('parseKometCode', () => {

  // ── TC burs ────────────────────────────────────────────────────────────────

  describe('TC burs — H-series', () => {
    test('H1.314.016 → round TC, FG shank, 1.6 mm head', () => {
      expect(parseKometCode('H1.314.016')).toEqual({
        shape_family:      'round',
        material:          'tungsten_carbide',
        grit_ring_color:   null,
        family_code:       'H1',
        shank_type:        'fg',
        shank_diameter_mm: 1.6,
        head_size_code:    '016',
        head_size_mm:      1.6,
      })
    })

    test('H2.204.010 → inverted_cone TC, CA shank', () => {
      expect(parseKometCode('H2.204.010')).toEqual(
        tc('inverted_cone', { shank_type: 'ca', shank_diameter_mm: 2.35, head_size_mm: 1.0 }),
      )
    })

    test('H7.314.018 → pear TC, FG shank', () => {
      expect(parseKometCode('H7.314.018')).toEqual(tc('pear', { shank_type: 'fg' }))
    })

    test('H21.314.012 → cylinder_round_end TC (round end fissure)', () => {
      expect(parseKometCode('H21.314.012')).toEqual(tc('cylinder_round_end'))
    })

    test('H23R.314.014 → tapered_round_end (round end tapered fissure)', () => {
      expect(parseKometCode('H23R.314.014')).toEqual(tc('tapered_round_end'))
    })

    test('H33.314.016 → tapered_flat_end (crosscut tapered fissure)', () => {
      expect(parseKometCode('H33.314.016')).toEqual(tc('tapered_flat_end'))
    })

    test('H33R.314.016 → tapered_round_end (crosscut tapered round end)', () => {
      expect(parseKometCode('H33R.314.016')).toEqual(tc('tapered_round_end'))
    })

    test('H59.314.016 → cylinder TC', () => {
      expect(parseKometCode('H59.314.016')).toEqual(tc('cylinder'))
    })

    test('H141.104.023 → round TC, HP shank', () => {
      expect(parseKometCode('H141.104.023')).toEqual(
        tc('round', { shank_type: 'hp', shank_diameter_mm: 2.35 }),
      )
    })

    test('H379.104.060 → egg TC (football/egg shape)', () => {
      expect(parseKometCode('H379.104.060')).toEqual(tc('egg', { shank_type: 'hp' }))
    })

    test('H390.104.030 → flame TC (round-end Neumeyer flame)', () => {
      expect(parseKometCode('H390.104.030')).toEqual(tc('flame', { shank_type: 'hp' }))
    })

    // Suffix stripping: same shape regardless of letter suffix
    test('H1SE.204.016 → round TC (SE suffix stripped)', () => {
      expect(parseKometCode('H1SE.204.016')).toEqual(tc('round', { shank_type: 'ca' }))
    })

    test('H251FSQ.104.023 → tapered_round_end TC (FSQ suffix stripped)', () => {
      expect(parseKometCode('H251FSQ.104.023')).toEqual(tc('tapered_round_end'))
    })

    test('H138SHAX.104.023 → tapered_flat_end TC (SHAX suffix stripped)', () => {
      expect(parseKometCode('H138SHAX.104.023')).toEqual(tc('tapered_flat_end'))
    })
  })

  // ── Diamond instruments ────────────────────────────────────────────────────

  describe('diamond instruments — standard series', () => {
    test('801.314.016 → round diamond, standard blue grit', () => {
      expect(parseKometCode('801.314.016')).toEqual(diamond('round', 'blue', { family_code: '801', shank_type: 'fg' }))
    })

    test('8801.314.018 → round diamond, fine red grit', () => {
      expect(parseKometCode('8801.314.018')).toEqual(diamond('round', 'red', { family_code: '8801' }))
    })

    test('6801.314.018 → round diamond, coarse green grit', () => {
      expect(parseKometCode('6801.314.018')).toEqual(diamond('round', 'green'))
    })

    test('5801.314.018 → round diamond, super-coarse black grit', () => {
      expect(parseKometCode('5801.314.018')).toEqual(diamond('round', 'black'))
    })

    test('837.314.016 → cylinder diamond', () => {
      expect(parseKometCode('837.314.016')).toEqual(diamond('cylinder', 'blue'))
    })

    test('8837.314.014 → cylinder diamond fine/red', () => {
      expect(parseKometCode('8837.314.014')).toEqual(diamond('cylinder', 'red'))
    })

    test('847.314.016 → tapered_flat_end diamond (standard prep bur)', () => {
      expect(parseKometCode('847.314.016')).toEqual(diamond('tapered_flat_end', 'blue'))
    })

    test('856.314.016 → tapered_round_end diamond', () => {
      expect(parseKometCode('856.314.016')).toEqual(diamond('tapered_round_end', 'blue'))
    })

    test('862.314.012 → flame diamond', () => {
      expect(parseKometCode('862.314.012')).toEqual(diamond('flame', 'blue'))
    })

    test('879.314.018 → torpedo diamond', () => {
      expect(parseKometCode('879.314.018')).toEqual(diamond('torpedo', 'blue'))
    })

    test('881.314.012 → cylinder_round_end diamond', () => {
      expect(parseKometCode('881.314.012')).toEqual(diamond('cylinder_round_end', 'blue'))
    })

    test('242.104.023 → round diamond HP (bone cutter — fixed from steel wheel)', () => {
      expect(parseKometCode('242.104.023')).toEqual(
        diamond('round', 'blue', { shank_type: 'hp' }),
      )
    })
  })

  describe('diamond instruments — KR/KREF modified shoulder variants', () => {
    const tapered847 = 'tapered_flat_end'

    test('847KR.314.016 → tapered_flat_end, still blue (KR = shape modifier, no grit change)', () => {
      expect(parseKometCode('847KR.314.016')).toEqual(diamond(tapered847, 'blue'))
    })

    test('8847KR.314.016 → tapered_flat_end, fine/red (8 prefix + KR)', () => {
      expect(parseKometCode('8847KR.314.016')).toEqual(diamond(tapered847, 'red'))
    })

    test('847KREF.314.016 → tapered_flat_end, yellow grit (KREF = KR + EF/extra-fine)', () => {
      expect(parseKometCode('847KREF.314.016')).toEqual(diamond(tapered847, 'yellow'))
    })

    test('801UF.314.016 → round, white/ultra-fine grit', () => {
      expect(parseKometCode('801UF.314.016')).toEqual(diamond('round', 'white'))
    })

    test('801EF.314.016 → round, yellow/extra-fine grit', () => {
      expect(parseKometCode('801EF.314.016')).toEqual(diamond('round', 'yellow'))
    })
  })

  describe('diamond instruments — DIAO KP series', () => {
    test('KP6801.314.016 → round DIAO, coarse green', () => {
      expect(parseKometCode('KP6801.314.016')).toEqual(diao('round', 'green'))
    })

    test('KP8801.314.018 → round DIAO, fine red', () => {
      expect(parseKometCode('KP8801.314.018')).toEqual(diao('round', 'red'))
    })

    test('KP6847KR.314.016 → tapered_flat_end DIAO, coarse green', () => {
      expect(parseKometCode('KP6847KR.314.016')).toEqual(diao('tapered_flat_end', 'green'))
    })

    test('KP6856.314.016 → tapered_round_end DIAO, coarse green', () => {
      expect(parseKometCode('KP6856.314.016')).toEqual(diao('tapered_round_end', 'green'))
    })
  })

  describe('diamond instruments — ZR zirconia series', () => {
    test('ZR856.314.016 → tapered_round_end diamond, standard blue', () => {
      expect(parseKometCode('ZR856.314.016')).toEqual(diamond('tapered_round_end', 'blue'))
    })

    test('ZR8856.314.016 → tapered_round_end diamond, fine red', () => {
      expect(parseKometCode('ZR8856.314.016')).toEqual(diamond('tapered_round_end', 'red'))
    })

    test('ZR801.314.016 → round diamond (ZR no grit prefix)', () => {
      expect(parseKometCode('ZR801.314.016')).toEqual(diamond('round', 'blue'))
    })
  })

  describe('diamond instruments — S-prefix (Safer variant)', () => {
    test('S6837.314.016 → cylinder diamond, coarse green', () => {
      expect(parseKometCode('S6837.314.016')).toEqual(diamond('cylinder', 'green'))
    })

    test('S5801.314.018 → round diamond, super-coarse black', () => {
      expect(parseKometCode('S5801.314.018')).toEqual(diamond('round', 'black'))
    })
  })

  describe('diamond instruments — 2xxx series', () => {
    test('2847.314.016 → tapered_flat_end diamond, treated as standard/blue grit', () => {
      expect(parseKometCode('2847.314.016')).toEqual(diamond('tapered_flat_end', 'blue'))
    })
  })

  // ── Ceramic instruments ────────────────────────────────────────────────────

  describe('ceramic instruments', () => {
    test('K1SM.204.016 → round ceramic, CA shank (CeraBur)', () => {
      expect(parseKometCode('K1SM.204.016')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'round', shank_type: 'ca' }),
      )
    })

    test('K1SM.205.016 → round ceramic, CA long shank', () => {
      expect(parseKometCode('K1SM.205.016')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'round', shank_type: 'ca' }),
      )
    })

    test('KT.314.016 → round ceramic, FG shank (CeraTip)', () => {
      expect(parseKometCode('KT.314.016')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'round', shank_type: 'fg' }),
      )
    })

    test('K59.314.016 → round ceramic, FG shank', () => {
      expect(parseKometCode('K59.314.016')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'round', shank_type: 'fg' }),
      )
    })

    test('K157.104.016 → cylinder ceramic, HP shank (bone cutter cylindrical)', () => {
      expect(parseKometCode('K157.104.016')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'cylinder', shank_type: 'hp' }),
      )
    })

    test('K160A.104.023 → round ceramic, HP shank (bone cutter round)', () => {
      expect(parseKometCode('K160A.104.023')).toEqual(
        expect.objectContaining({ material: 'ceramic', shape_family: 'round', shank_type: 'hp' }),
      )
    })
  })

  // ── Polymer bur ────────────────────────────────────────────────────────────

  describe('polymer bur', () => {
    test('P1.204.014 → round polymer, CA shank (PolyBur)', () => {
      expect(parseKometCode('P1.204.014')).toEqual(
        expect.objectContaining({ material: 'polymer', shape_family: 'round', shank_type: 'ca' }),
      )
    })

    test('P1.204.018 → round polymer, CA shank', () => {
      expect(parseKometCode('P1.204.018')).toEqual(
        expect.objectContaining({ material: 'polymer', shape_family: 'round', shank_type: 'ca' }),
      )
    })
  })

  // ── Diamond strips ─────────────────────────────────────────────────────────

  describe('diamond reciprocating strips', () => {
    test('DF1.000.025 → diamond other, unmounted (standard strip)', () => {
      expect(parseKometCode('DF1.000.025')).toEqual(
        expect.objectContaining({ material: 'diamond', shape_family: 'other', shank_type: 'unmounted' }),
      )
    })

    test('DF1EF.000.025 → diamond other, unmounted (extra-fine strip)', () => {
      expect(parseKometCode('DF1EF.000.025')).toEqual(
        expect.objectContaining({ material: 'diamond', shape_family: 'other', shank_type: 'unmounted' }),
      )
    })
  })

  // ── Gutta percha / paper points ────────────────────────────────────────────

  describe('gutta percha cones and paper points', () => {
    test('GP04.000.020 → gutta_percha cone, unmounted', () => {
      expect(parseKometCode('GP04.000.020')).toEqual(
        expect.objectContaining({ material: 'gutta_percha', shape_family: 'cone', shank_type: 'unmounted' }),
      )
    })

    test('GPF06.000.025 → gutta_percha cone (GPF variant)', () => {
      expect(parseKometCode('GPF06.000.025')).toEqual(
        expect.objectContaining({ material: 'gutta_percha', shape_family: 'cone' }),
      )
    })

    test('PP04.000.020 → paper_point cone, unmounted', () => {
      expect(parseKometCode('PP04.000.020')).toEqual(
        expect.objectContaining({ material: 'paper_point', shape_family: 'cone', shank_type: 'unmounted' }),
      )
    })
  })

  // ── NiTi rotary endo files ─────────────────────────────────────────────────

  describe('NiTi rotary endo files', () => {
    test('FQ04L21.204.020 → nickel_titanium tapered_round_end, CA shank', () => {
      expect(parseKometCode('FQ04L21.204.020')).toEqual(
        expect.objectContaining({ material: 'nickel_titanium', shape_family: 'tapered_round_end', shank_type: 'ca' }),
      )
    })

    test('PROC4L21.204.045.R0 → nickel_titanium (4-part code, .R0 stripped)', () => {
      expect(parseKometCode('PROC4L21.204.045.R0')).toEqual(
        expect.objectContaining({ material: 'nickel_titanium', shape_family: 'tapered_round_end', family_code: 'PROC4L21' }),
      )
    })

    test('PROC6L21.204.040.R06 → nickel_titanium (.R06 suffix stripped)', () => {
      expect(parseKometCode('PROC6L21.204.040.R06')).toEqual(
        expect.objectContaining({ material: 'nickel_titanium', family_code: 'PROC6L21' }),
      )
    })
  })

  // ── CERC diamond burs ──────────────────────────────────────────────────────

  describe('CERC rotary diamond burs', () => {
    test('CERC.314.018 → round diamond, FG shank, blue grit', () => {
      expect(parseKometCode('CERC.314.018')).toEqual(
        expect.objectContaining({ material: 'diamond', shape_family: 'round', shank_type: 'fg', grit_ring_color: 'blue' }),
      )
    })

    test('CERCS.314.016 → round diamond, FG shank (CERCS variant)', () => {
      expect(parseKometCode('CERCS.314.016')).toEqual(
        expect.objectContaining({ material: 'diamond', shape_family: 'round', shank_type: 'fg' }),
      )
    })
  })

  // ── DCB implant surgical burs ──────────────────────────────────────────────

  describe('DCB implant surgical burs', () => {
    test('DCB2BA.104.030 → round TC, HP shank (ball bur)', () => {
      expect(parseKometCode('DCB2BA.104.030')).toEqual(
        expect.objectContaining({ material: 'tungsten_carbide', shape_family: 'round', shank_type: 'hp' }),
      )
    })

    test('DCB3CA.104.023 → inverted_cone TC, HP shank (countersink)', () => {
      expect(parseKometCode('DCB3CA.104.023')).toEqual(
        expect.objectContaining({ material: 'tungsten_carbide', shape_family: 'inverted_cone', shank_type: 'hp' }),
      )
    })

    test('DCB1MA.104.023 → cylinder TC, HP shank (drill)', () => {
      expect(parseKometCode('DCB1MA.104.023')).toEqual(
        expect.objectContaining({ material: 'tungsten_carbide', shape_family: 'cylinder', shank_type: 'hp' }),
      )
    })
  })

  // ── Manual endo files ──────────────────────────────────────────────────────

  describe('manual endo hand files', () => {
    test('17321.654.025 → endo_file, steel, grip shank (K-file)', () => {
      expect(parseKometCode('17321.654.025')).toEqual(
        expect.objectContaining({ material: 'steel', shape_family: 'endo_file', shank_type: 'grip' }),
      )
    })

    test('17121.654.020 → endo_file, steel, grip shank (K-reamer)', () => {
      expect(parseKometCode('17121.654.020')).toEqual(
        expect.objectContaining({ material: 'steel', shape_family: 'endo_file', shank_type: 'grip' }),
      )
    })

    test('17421.654.025 → endo_file, steel, grip shank (H-file)', () => {
      expect(parseKometCode('17421.654.025')).toEqual(
        expect.objectContaining({ material: 'steel', shape_family: 'endo_file', shank_type: 'grip' }),
      )
    })

    test('183L.204.025 → other, steel, CA shank (contra-angle reamer)', () => {
      expect(parseKometCode('183L.204.025')).toEqual(
        expect.objectContaining({ material: 'steel', shape_family: 'other', shank_type: 'ca' }),
      )
    })

    test('191.204.018 → round, steel, CA shank (pulp bur)', () => {
      expect(parseKometCode('191.204.018')).toEqual(
        expect.objectContaining({ material: 'steel', shape_family: 'round', shank_type: 'ca' }),
      )
    })
  })

  // ── Polishing instruments ──────────────────────────────────────────────────

  describe('polymer polishing instruments', () => {
    test('9030C.104.060 → round polymer, HP shank (coarse)', () => {
      expect(parseKometCode('9030C.104.060')).toEqual(
        expect.objectContaining({ material: 'polymer', shape_family: 'round', shank_type: 'hp' }),
      )
    })

    test('9030EF.104.060 → round polymer, HP shank (extra-fine)', () => {
      expect(parseKometCode('9030EF.104.060')).toEqual(
        expect.objectContaining({ material: 'polymer', shape_family: 'round', shank_type: 'hp' }),
      )
    })

    test('9050EF.314.060 → round polymer, FG shank', () => {
      expect(parseKometCode('9050EF.314.060')).toEqual(
        expect.objectContaining({ material: 'polymer', shape_family: 'round', shank_type: 'fg' }),
      )
    })
  })

  // ── Ultrasonic PiezoLine tips ──────────────────────────────────────────────

  describe('ultrasonic PiezoLine scaler tips', () => {
    test('PS.EM1.025 → sonic_tip, unknown shank (EM1 PiezoLine tip)', () => {
      expect(parseKometCode('PS.EM1.025')).toEqual(
        expect.objectContaining({ material: 'sonic_tip', shape_family: 'sonic_tip', shank_type: 'unknown' }),
      )
    })

    test('PL9.EM1.025 → sonic_tip (PL9 tip)', () => {
      expect(parseKometCode('PL9.EM1.025')).toEqual(
        expect.objectContaining({ material: 'sonic_tip', shape_family: 'sonic_tip', shank_type: 'unknown' }),
      )
    })

    test('PE1.SI1.025 → sonic_tip (SI1 connection)', () => {
      expect(parseKometCode('PE1.SI1.025')).toEqual(
        expect.objectContaining({ material: 'sonic_tip', shank_type: 'unknown' }),
      )
    })

    test('1981.EM1.000 → null (numeric code = accessory holder, not a tip)', () => {
      expect(parseKometCode('1981.EM1.000')).toBeNull()
    })
  })

  // ── Shank type normalisation ───────────────────────────────────────────────

  describe('shank type normalisation', () => {
    test('314 → fg, Ø 1.6 mm', () => {
      const r = parseKometCode('801.314.016')
      expect(r?.shank_type).toBe('fg')
      expect(r?.shank_diameter_mm).toBe(1.6)
    })

    test('204 → ca, Ø 2.35 mm', () => {
      const r = parseKometCode('801.204.016')
      expect(r?.shank_type).toBe('ca')
      expect(r?.shank_diameter_mm).toBe(2.35)
    })

    test('104 → hp, Ø 2.35 mm', () => {
      const r = parseKometCode('801.104.016')
      expect(r?.shank_type).toBe('hp')
      expect(r?.shank_diameter_mm).toBe(2.35)
    })

    test('103 → hp (HP short variant)', () => {
      expect(parseKometCode('801.103.016')?.shank_type).toBe('hp')
    })

    test('205 → ca (CA long variant)', () => {
      expect(parseKometCode('801.205.016')?.shank_type).toBe('ca')
    })

    test('313 → fg (FG short variant)', () => {
      expect(parseKometCode('801.313.016')?.shank_type).toBe('fg')
    })
  })

  // ── Skip list (non-instrument consumables and accessories) ─────────────────

  describe('skip list', () => {
    test('SF847KR → null (SonicLine tip, not a rotary bur)', () => {
      expect(parseKometCode('SF847KR.314.016')).toBeNull()
    })

    test('SFQ8979 → null (SonicLine Quick tip)', () => {
      expect(parseKometCode('SFQ8979.314.016')).toBeNull()
    })

    test('OS1F → null (oscillating IPR disc)', () => {
      expect(parseKometCode('OS1F.204.000')).toBeNull()
    })

    test('SFS120 → null (sonic surgical tip accessory)', () => {
      expect(parseKometCode('SFS120.204.000')).toBeNull()
    })

    test('EP0147 → null (EndoPilot accessory)', () => {
      expect(parseKometCode('EP0147.000.000')).toBeNull()
    })

    test('BCR1 → null (bioceramic putty material)', () => {
      expect(parseKometCode('BCR1.000.000')).toBeNull()
    })
  })

  // ── Unknown / malformed codes ──────────────────────────────────────────────

  describe('unknown and malformed codes', () => {
    test('ZZZ.314.016 → null (family code not in any map)', () => {
      expect(parseKometCode('ZZZ.314.016')).toBeNull()
    })

    test('H1314016 → null (no dots — malformed)', () => {
      expect(parseKometCode('H1314016')).toBeNull()
    })

    test('H1.999.016 → null (unknown shank code 999)', () => {
      expect(parseKometCode('H1.999.016')).toBeNull()
    })
  })
})

// ─── calculateHeadSizeMm ─────────────────────────────────────────────────────

describe('calculateHeadSizeMm', () => {
  test('FG shank: head 2× shank pixels → rawMm 3.2 → snaps to ISO 3.1', () => {
    expect(calculateHeadSizeMm(200, 100, 'fg')).toBe(3.1)
  })

  test('FG shank: head/shank ratio = 1.0 → rawMm 1.6 → exact ISO 1.6', () => {
    expect(calculateHeadSizeMm(160, 160, 'fg')).toBe(1.6)
  })

  test('CA shank: head = shank → rawMm 2.35 → snaps to ISO 2.3', () => {
    expect(calculateHeadSizeMm(100, 100, 'ca')).toBe(2.3)
  })

  test('HP shank: same diameter as CA → same calculation', () => {
    expect(calculateHeadSizeMm(100, 100, 'hp')).toBe(2.3)
  })

  test('returns null when shankPx = 0', () => {
    expect(calculateHeadSizeMm(100, 0, 'fg')).toBeNull()
  })

  test('returns null for unknown shank type', () => {
    expect(calculateHeadSizeMm(100, 100, 'unknown')).toBeNull()
  })
})
