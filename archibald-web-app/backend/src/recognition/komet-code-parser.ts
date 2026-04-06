// Komet dental instrument code parser
// Parses the Komet 3-part product name: {familyCode}.{shankCode}.{sizeCode}
// where sizeCode = head diameter × 10 (e.g. 016 = 1.6 mm)
//
// Shank types normalised for visual recognition (Vision API returns these values):
//   fg        = friction grip, Ø 1.6 mm  (codes 313/314/315/316)
//   ca        = contra-angle, Ø 2.35 mm  (codes 204/205/206)
//   hp        = straight handpiece, Ø 2.35 mm (codes 103/104/105/123/124)
//   grip      = plastic finger-grip, Ø 4 mm   (codes 654/634/644)
//   unmounted = no shank (codes 000/900)
//   unknown   = not determinable (ultrasonic connection EM1/SI1/KA1/ST1)
//
// Diamond grit colours (ISO 6360):
//   white  = UF ultra-fine  ~8 µm
//   yellow = EF extra-fine  ~25 µm
//   red    = fine           ~46 µm
//   blue   = standard       ~107 µm  (default when no grit prefix)
//   green  = coarse         ~151 µm
//   black  = super-coarse   ~181 µm

type ParsedFeatures = {
  shape_family:      string
  material:          string
  grit_ring_color:   string | null
  family_code:       string
  shank_type:        string
  shank_diameter_mm: number
  head_size_code:    string
  head_size_mm:      number
}

type FamilyFeatures = {
  shape_family:    string
  material:        string
  grit_ring_color: string | null
}

// --------------------------------------------------------------------------
// Shank type map: ISO code → normalised visual type
// All FG variants → 'fg', all CA variants → 'ca', all HP variants → 'hp'
// --------------------------------------------------------------------------
const SHANK_TYPE_MAP: Record<string, string> = {
  '103': 'hp',  '104': 'hp',  '105': 'hp',  '106': 'hp',  // straight handpiece (HP) short/std/long/xlong
  '123': 'hp',  '124': 'hp',                               // HP thick variants (Ø 3.00mm)
  '204': 'ca',  '205': 'ca',  '206': 'ca',                // contra-angle (CA) std/long/xlong
  '313': 'fg',  '314': 'fg',  '315': 'fg',  '316': 'fg', // friction grip (FG) short/std/long/xlong
  '471': 'fg',                                              // FO/PCR perio tip (Ø 1.60mm)
  '654': 'grip', '634': 'grip', '644': 'grip',             // plastic finger-grip handle
  '000': 'unmounted', '900': 'unmounted',                   // unmounted
  '310': 'hp',                                              // steel bur disc shank (HP)
  '155': 'hp',   '279': 'hp',  '280': 'hp',  '320': 'hp', // misc HP/disc
}

// Ultrasonic PiezoLine connection codes (EM1/SI1/KA1/ST1) — not in SHANK_TYPE_MAP;
// handled separately in parseKometCode; result shank_type = 'unknown'
const ULTRASONIC_CONNECTIONS = new Set(['EM1', 'SI1', 'KA1', 'ST1'])

const SHANK_DIAMETERS_MM: Record<string, number> = {
  fg: 1.6, ca: 2.35, hp: 2.35, grip: 4.0, unmounted: 0, unknown: 0,
}

// --------------------------------------------------------------------------
// ISO 6360 diamond shape base codes → shape_family
// Applies to: plain numeric series (801, 837…), grit-prefixed (8801, 6837…),
// brand-prefixed (KP6xxx, ZRxxx, S5xxx, A8xxx…) after prefix stripping.
// --------------------------------------------------------------------------
const DIAMOND_SHAPE_MAP: Record<string, string> = {
  '242': 'round',    // HP diamond round bone cutter (surgery)
  '368': 'bud',             '369': 'bud',             '370': 'other',
  '379': 'egg',             '390': 'flame',            '392': 'other',
  '801': 'round',           '802': 'round',            '803': 'round',   '804': 'round',
  '805': 'inverted_cone',   '806': 'inverted_cone',    '807': 'inverted_cone',
  '809': 'inverted_cone',   '810': 'inverted_cone',    '811': 'bud',
  '812': 'diabolo',         '813': 'diabolo',           '814': 'inverted_cone',
  '817': 'inverted_cone',   '818': 'wheel',
  '820': 'cylinder',        '822': 'pear',
  '824': 'wheel',           '825': 'wheel',
  '828': 'cylinder',        '830': 'pear',
  '831': 'bud',             '832': 'bud',
  '833': 'other',           '834': 'cylinder',
  '835': 'cylinder',        '836': 'cylinder',         '837': 'cylinder',
  '838': 'cylinder_round_end', '839': 'cylinder',      '842': 'cylinder',
  '845': 'tapered_flat_end',  '846': 'tapered_flat_end',
  '847': 'tapered_flat_end',  '848': 'tapered_flat_end',
  '849': 'tapered_round_end', '850': 'tapered_round_end',
  '851': 'tapered_flat_end',  '852': 'tapered_flat_end',
  '855': 'tapered_round_end', '856': 'tapered_round_end', '857': 'tapered_round_end',
  '858': 'tapered_flat_end',  '859': 'tapered_flat_end',
  '860': 'flame',  '861': 'flame',  '862': 'flame',
  '863': 'flame',  '864': 'flame',  '867': 'flame',  '869': 'flame',
  '868': 'cylinder',
  '875': 'torpedo', '876': 'torpedo', '877': 'torpedo',
  '878': 'torpedo', '879': 'torpedo',
  '880': 'cylinder_round_end', '881': 'cylinder_round_end', '882': 'cylinder_round_end',
  '883': 'cylinder_round_end',
  '884': 'cylinder',  '885': 'cylinder',  '886': 'cylinder',
  '888': 'flame',     '889': 'flame',
  '892': 'torpedo',   '893': 'torpedo',   '894': 'torpedo',
  '899': 'bud',
  '905': 'bud',
  '909': 'wheel',
  '910': 'wheel',  '911': 'wheel',  '918': 'wheel',  '919': 'wheel',
  '924': 'wheel',  '934': 'wheel',  '936': 'wheel',  '940': 'wheel',
  '942': 'wheel',  '943': 'wheel',  '946': 'wheel',
  '951': 'tapered_flat_end',  '952': 'tapered_round_end',
  '953': 'cylinder',
  '955': 'tapered_flat_end',  '956': 'tapered_flat_end',
  '957': 'tapered_round_end',
  '959': 'tapered_round_end', '960': 'tapered_flat_end',
  '964': 'tapered_flat_end',  '965': 'tapered_flat_end',
  '972': 'flame',   '973': 'flame',
  '977': 'torpedo', '979': 'torpedo',
  '981': 'torpedo', '982': 'torpedo', '983': 'torpedo',
  '984': 'torpedo', '985': 'torpedo', '986': 'cylinder',
}

// --------------------------------------------------------------------------
// H-series TC bur shape map (Komet-specific numbering)
// Exact code first, then R/XL shape-modifier variants, then H+digits fallback
// --------------------------------------------------------------------------
const H_SHAPE_MAP: Record<string, string> = {
  'H1':   'round',              'H2':   'inverted_cone',
  'H3':   'cylinder',           'H4':   'tapered_flat_end',
  'H7':   'pear',
  'H21':  'cylinder_round_end', 'H22':  'cylinder_round_end',
  'H21R': 'tapered_round_end',  'H22R': 'tapered_round_end',
  'H23':  'tapered_flat_end',   'H23R': 'tapered_round_end',
  'H24':  'pear',               'H26':  'tapered_round_end',
  'H30':  'tapered_flat_end',
  'H31':  'cylinder',           'H31R': 'cylinder_round_end',
  'H32':  'cylinder',
  'H33':  'tapered_flat_end',   'H33R': 'tapered_round_end',
  'H34':  'tapered_flat_end',
  'H40':  'tapered_flat_end',   'H41':  'round',
  'H42':  'cylinder',
  'H46':  'flame',  'H47': 'flame',  'H48': 'flame',
  'H50':  'tapered_round_end',
  'H52':  'tapered_flat_end',
  'H59':  'cylinder',
  'H71':  'round',
  'H72':  'cylinder',
  'H73':  'tapered_round_end',
  'H77':  'wheel',   'H78': 'wheel',
  'H79':  'tapered_flat_end',
  'H88':  'egg',     'H89': 'egg',
  'H97':  'other',   'H99': 'other',
  'H129': 'cylinder',
  'H132': 'flame',   'H133': 'flame',
  'H134': 'tapered_flat_end',  'H135': 'tapered_flat_end',
  'H136': 'tapered_flat_end',  'H137': 'tapered_flat_end',
  'H138': 'tapered_flat_end',  'H139': 'tapered_flat_end',
  'H141': 'round',
  'H161': 'cylinder',  'H162': 'cylinder',  'H163': 'cylinder',
  'H166': 'cylinder',  'H167': 'cylinder',
  'H203': 'tapered_round_end', 'H206': 'tapered_round_end',
  'H207': 'cylinder',          'H210': 'cylinder',
  'H219': 'tapered_round_end',
  'H245': 'pear',    'H246': 'flame',
  'H247': 'tapered_flat_end',  'H249': 'tapered_flat_end',
  'H250': 'tapered_flat_end',  'H251': 'tapered_round_end',
  'H254': 'cylinder',  'H255': 'cylinder',  'H257': 'cylinder',
  'H259': 'tapered_flat_end',  'H260': 'tapered_flat_end',
  'H261': 'tapered_flat_end',
  'H267': 'cylinder',          'H269': 'tapered_flat_end',
  'H275': 'tapered_round_end',
  'H281': 'tapered_flat_end',  'H282': 'tapered_flat_end',
  'H283': 'tapered_flat_end',  'H284': 'tapered_flat_end',
  'H294': 'tapered_flat_end',  'H295': 'tapered_flat_end',
  'H296': 'tapered_flat_end',  'H297': 'tapered_flat_end',
  'H336': 'tapered_flat_end',
  'H347': 'tapered_flat_end',  'H349': 'tapered_flat_end',
  'H351': 'tapered_flat_end',  'H356': 'tapered_round_end',
  'H364': 'tapered_round_end',
  'H370': 'tapered_flat_end',  'H371': 'tapered_flat_end',
  'H372': 'tapered_flat_end',  'H373': 'tapered_flat_end',
  'H374': 'tapered_flat_end',  'H375': 'tapered_flat_end',
  'H376': 'tapered_flat_end',  'H377': 'tapered_flat_end',
  'H378': 'tapered_flat_end',
  'H379': 'egg',
  'H390': 'flame',
  // TC finishing burs mirroring diamond shape codes
  'H847': 'tapered_flat_end',
  'H856': 'tapered_round_end',
  'H881': 'cylinder_round_end',
}

// --------------------------------------------------------------------------
// Steel lab bur shape map (simple 1–3 digit family codes, HP/CA shank)
// Note: '242' removed — it is a diamond HP round (see DIAMOND_SHAPE_MAP)
// --------------------------------------------------------------------------
const STEEL_SHAPE_MAP: Record<string, string> = {
  '1': 'round',   '2': 'round',   '3': 'cylinder',
  '5': 'cylinder', '6': 'inverted_cone',
  '36': 'wheel',   '38': 'wheel',  '41': 'round',
  '48': 'flame',   '50': 'cylinder',
  '57': 'cylinder', '58': 'cylinder', '59': 'cylinder',
  '60': 'cylinder', '61': 'cylinder', '62': 'cylinder',
  '75': 'torpedo',  '79': 'tapered_flat_end',
  '108': 'cylinder',
  '182': 'other',   '183': 'other',
  '203': 'round',
}

// --------------------------------------------------------------------------
// Ceramic instrument map: familyCode → shape_family
// K1SM = CeraBur (round), KT = CeraTip (round),
// K157 = ceramic cylindrical bone cutter, K160/K160A = ceramic round bone cutter
// --------------------------------------------------------------------------
const CERAMIC_SHAPE_MAP: Record<string, string> = {
  'K1SM':  'round',
  'K59':   'round',
  'KT':    'round',
  'K157':  'cylinder',
  'K160':  'round',
  'K160A': 'round',
}

// --------------------------------------------------------------------------
// Skip lists — consumables, accessories, and non-instrument products
// --------------------------------------------------------------------------
const SKIP_PREFIXES = new Set([
  'SF', 'SFQ', 'OS', 'SFS', 'EP',
  'BCR', 'BCS', 'PRQ',
  'RKP', 'RKT', 'ICT',
  'PACK', 'FILL', 'DM', 'DPXCL', 'TPXCL',
])

const SKIP_EXACT = new Set(['C', 'U', 'V', 'W', 'Z', 'H'])

function shouldSkip(familyCode: string): boolean {
  if (SKIP_EXACT.has(familyCode)) return true
  for (const prefix of SKIP_PREFIXES) {
    if (familyCode.startsWith(prefix)) return true
  }
  return false
}

// --------------------------------------------------------------------------
// Family parsers
// --------------------------------------------------------------------------

// Ultrasonic PiezoLine scaler tips (EM1/SI1/KA1/ST1 connection)
// Purely numeric family codes are accessory holders/adapters — skip them.
function parseUltrasonicTip(familyCode: string): FamilyFeatures | null {
  if (/^\d+$/.test(familyCode)) return null
  return { shape_family: 'sonic_tip', material: 'sonic_tip', grit_ring_color: null }
}

// DCB implant surgical burs: DCB{n}MA/BA/CA.104.{size}
// MA = cylindrical drill, BA = round/ball, CA = countersink (inverted cone)
function parseDcbFamily(familyCode: string): FamilyFeatures | null {
  if (!/^DCB\d/.test(familyCode)) return null
  const shape = familyCode.endsWith('BA') ? 'round'
              : familyCode.endsWith('CA') ? 'inverted_cone'
              : 'cylinder'
  return { shape_family: shape, material: 'tungsten_carbide', grit_ring_color: null }
}

// Manual endo hand files, contra-angle reamers, pulp bur
// 17xxx.654.{size}: K-reamers (17121), K-files (17321), H-files (17421)
// 183L/183LB.204.{size}: contra-angle latch reamers
// 191.204.{size}: pulp bur
function parseEndoManualFamily(familyCode: string): FamilyFeatures | null {
  if (/^17\d{3}$/.test(familyCode))
    return { shape_family: 'endo_file', material: 'steel', grit_ring_color: null }
  if (familyCode === '183L' || familyCode === '183LB')
    return { shape_family: 'other', material: 'steel', grit_ring_color: null }
  if (familyCode === '191')
    return { shape_family: 'round', material: 'steel', grit_ring_color: null }
  return null
}

// Ceramic burs: CeraBur (K1SM), CeraTip (KT), bone cutters (K157, K160, K160A)
function parseCeramicFamily(familyCode: string): FamilyFeatures | null {
  const shape = CERAMIC_SHAPE_MAP[familyCode]
  if (!shape) return null
  return { shape_family: shape, material: 'ceramic', grit_ring_color: null }
}

// PolyBur polymer bur: P1.204.{size}
function parsePolymerFamily(familyCode: string): FamilyFeatures | null {
  if (familyCode !== 'P1') return null
  return { shape_family: 'round', material: 'polymer', grit_ring_color: null }
}

// DF1 reciprocating diamond strips: DF1/DF1EF/DF1F/DF1C.000.{size}
function parseDiamondStripFamily(familyCode: string): FamilyFeatures | null {
  if (!familyCode.startsWith('DF1')) return null
  return { shape_family: 'other', material: 'diamond', grit_ring_color: null }
}

// GP/PP/GPF/GPFQ/GPR: gutta percha cones and paper points (unmounted, 000 shank)
function parseGpPpFamily(familyCode: string): FamilyFeatures | null {
  if (familyCode.startsWith('GP'))
    return { shape_family: 'cone', material: 'gutta_percha', grit_ring_color: null }
  if (familyCode.startsWith('PP'))
    return { shape_family: 'cone', material: 'paper_point', grit_ring_color: null }
  return null
}

// NiTi rotary endo files: PROC, FQ, F0x, OP, RE##L, P###L
function parseNitiRotaryFamily(familyCode: string): FamilyFeatures | null {
  if (
    familyCode.startsWith('PROC') ||
    /^FQ/.test(familyCode) ||
    /^F0[0-9]/.test(familyCode) ||
    /^OP[0-9]/.test(familyCode) ||
    /^RE[0-9]{2}L/.test(familyCode) ||
    /^P\d{3}L/.test(familyCode)
  ) {
    return { shape_family: 'tapered_round_end', material: 'nickel_titanium', grit_ring_color: null }
  }
  return null
}

// CERC/CERCS: rotary diamond burs (FG shank)
function parseCercFamily(familyCode: string): FamilyFeatures | null {
  if (familyCode === 'CERC' || familyCode === 'CERCS')
    return { shape_family: 'round', material: 'diamond', grit_ring_color: 'blue' }
  return null
}

// 9xxx polymer polishing instruments: 9{3-digit base}{optional letter grit suffix}
// e.g. 9030C, 9030M, 9030F, 9030EF, 9050EF, 9030AM
function parsePolishingFamily(familyCode: string): FamilyFeatures | null {
  if (!/^9\d{3}[A-Z]*$/.test(familyCode)) return null
  return { shape_family: 'round', material: 'polymer', grit_ring_color: null }
}

// --------------------------------------------------------------------------
// Diamond family parser
// Handles: plain numeric, 8/6/5/2 grit prefix, KP6/KP8 DIAO,
//          ZR8/ZR6/ZR zirconia, S5/S6/S8 Safer variants, A8/A6 anatomic.
// --------------------------------------------------------------------------
function parseDiamondFamily(
  familyCode: string,
): FamilyFeatures | null {
  let remaining = familyCode
  let material  = 'diamond'
  let grit: string | null = null

  // Helper: does remaining, after stripping `len` chars, still start with 3 digits?
  const hasShapeAfter = (len: number) => /^\d{3}/.test(remaining.slice(len))

  // 1. Strip brand / material prefix and extract associated grit
  if (remaining.startsWith('KP6')) {
    material = 'diamond_diao'; grit = 'green'; remaining = remaining.slice(3)
  } else if (remaining.startsWith('KP8')) {
    material = 'diamond_diao'; grit = 'red'; remaining = remaining.slice(3)
  } else if (remaining.startsWith('KP')) {
    material = 'diamond_diao'; remaining = remaining.slice(2)
  } else if (remaining.startsWith('ZR8') && hasShapeAfter(3)) {
    grit = 'red';  remaining = remaining.slice(3)
  } else if (remaining.startsWith('ZR6') && hasShapeAfter(3)) {
    grit = 'green'; remaining = remaining.slice(3)
  } else if (remaining.startsWith('ZR')) {
    remaining = remaining.slice(2)
  } else if (remaining.startsWith('A8') && hasShapeAfter(2)) {
    grit = 'red';  remaining = remaining.slice(2)
  } else if (remaining.startsWith('A6') && hasShapeAfter(2)) {
    grit = 'green'; remaining = remaining.slice(2)
  } else if (remaining.startsWith('S8') && hasShapeAfter(2)) {
    grit = 'red';  remaining = remaining.slice(2)
  } else if (remaining.startsWith('S6') && hasShapeAfter(2)) {
    grit = 'green'; remaining = remaining.slice(2)
  } else if (remaining.startsWith('S5') && hasShapeAfter(2)) {
    grit = 'black'; remaining = remaining.slice(2)
  }

  // 2. Numeric grit prefix (only when not already set by brand prefix above)
  // Only strip if after removing the first digit we still have ≥3 digits (valid shape code).
  if (grit === null) {
    const ch = remaining[0]
    const afterStrip = remaining.slice(1)
    const canStrip = /^\d{3}/.test(afterStrip)
    if (ch === '8' && canStrip) {
      grit = 'red';   remaining = afterStrip
    } else if (ch === '6' && canStrip) {
      grit = 'green'; remaining = afterStrip
    } else if (ch === '5' && canStrip) {
      grit = 'black'; remaining = afterStrip
    } else if (ch === '2' && canStrip) {
      grit = 'blue';  remaining = afterStrip  // treat 2xxx as standard/blue
    } else {
      grit = 'blue'  // default: standard blue
    }
  }

  // 3. Extract 3-digit shape code from the start of remaining
  const numMatch = remaining.match(/^(\d{3})/)
  if (!numMatch) return null
  const shapeCode = numMatch[1]!
  const suffix    = remaining.slice(3)

  // 4. Look up shape
  const shape_family = DIAMOND_SHAPE_MAP[shapeCode]
  if (!shape_family) return null

  // 5. Grit suffix overrides: EF → yellow, UF → white (e.g. 801UF, 847KREF)
  let finalGrit: string | null = grit
  if (suffix.includes('UF')) {
    finalGrit = 'white'
  } else if (suffix.includes('EF')) {
    finalGrit = 'yellow'
  }

  return { shape_family, material, grit_ring_color: finalGrit }
}

// --------------------------------------------------------------------------
// H-series TC bur parser
// --------------------------------------------------------------------------
function parseHSeriesFamily(familyCode: string): FamilyFeatures | null {
  if (!familyCode.startsWith('H')) return null

  // Exact match
  const exact = H_SHAPE_MAP[familyCode]
  if (exact) return { shape_family: exact, material: 'tungsten_carbide', grit_ring_color: null }

  // Try with shape modifier (R, L, XL, RS, RL, LR, LS immediately after H-digits)
  const modMatch = familyCode.match(/^(H\d+)(XL|RS|RL|LR|LS|R|L)/)
  if (modMatch) {
    const withMod = modMatch[1]! + modMatch[2]!
    const shaped  = H_SHAPE_MAP[withMod] ?? H_SHAPE_MAP[modMatch[1]!]
    if (shaped) return { shape_family: shaped, material: 'tungsten_carbide', grit_ring_color: null }
  }

  // Strip all letter suffixes → keep only H + leading digits
  const digitOnly = familyCode.match(/^(H\d+)/)
  if (digitOnly) {
    const base = H_SHAPE_MAP[digitOnly[1]!]
    if (base) return { shape_family: base, material: 'tungsten_carbide', grit_ring_color: null }
  }

  return null
}

// --------------------------------------------------------------------------
// Steel bur parser (plain 1–3 digit family codes, HP/CA shank)
// --------------------------------------------------------------------------
function parseSteelFamily(familyCode: string): FamilyFeatures | null {
  const shape = STEEL_SHAPE_MAP[familyCode]
  if (!shape) return null
  return { shape_family: shape, material: 'steel', grit_ring_color: null }
}

// --------------------------------------------------------------------------
// ISO snap-to-nearest head size table
// --------------------------------------------------------------------------
const ISO_SIZES_MM = [
  0.5, 0.6, 0.7, 0.8, 0.9,
  1.0, 1.2, 1.4, 1.6, 1.8,
  2.1, 2.3, 2.5, 2.7, 2.9,
  3.1, 3.5,
]

// --------------------------------------------------------------------------
// Internal helper: build ParsedFeatures from resolved components
// --------------------------------------------------------------------------
function makeResult(
  familyCode: string,
  shankType: string,
  sizeRaw: string,
  features: FamilyFeatures,
): ParsedFeatures {
  const digits = parseInt(sizeRaw, 10)
  const head_size_mm = Number.isNaN(digits) ? 0 : digits / 10
  return {
    shape_family:      features.shape_family,
    material:          features.material,
    grit_ring_color:   features.grit_ring_color,
    family_code:       familyCode,
    shank_type:        shankType,
    shank_diameter_mm: SHANK_DIAMETERS_MM[shankType] ?? 0,
    head_size_code:    sizeRaw.trim(),
    head_size_mm,
  }
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

function parseKometCode(productName: string): ParsedFeatures | null {
  // Pre-strip .R0[digit*] suffix from PROC NiTi 4-part codes (e.g. PROC4L21.204.045.R0)
  const normalized = productName.replace(/\.R0\d*$/, '')

  // Allow 3-char alphanumeric shank codes (EM1/SI1/KA1/ST1) and flexible size field
  const match = normalized.match(/^(.+?)\.([A-Z0-9]{3})\.([A-Z0-9]+)$/)
  if (!match) return null

  const [, familyRaw, shankCode, sizeRaw] = match as [string, string, string, string]

  if (shouldSkip(familyRaw)) return null

  // Ultrasonic connection codes → route to tip parser; shank stored as 'unknown'
  if (ULTRASONIC_CONNECTIONS.has(shankCode)) {
    const features = parseUltrasonicTip(familyRaw)
    if (!features) return null
    return makeResult(familyRaw, 'unknown', sizeRaw, features)
  }

  const shankType = SHANK_TYPE_MAP[shankCode]
  if (!shankType) return null

  // Resolution order: specialised new families first, then legacy parsers
  const features =
    parseDcbFamily(familyRaw) ??
    parseEndoManualFamily(familyRaw) ??
    parseCeramicFamily(familyRaw) ??
    parsePolymerFamily(familyRaw) ??
    parseDiamondStripFamily(familyRaw) ??
    parseGpPpFamily(familyRaw) ??
    parseNitiRotaryFamily(familyRaw) ??
    parseCercFamily(familyRaw) ??
    parsePolishingFamily(familyRaw) ??
    parseHSeriesFamily(familyRaw) ??
    parseDiamondFamily(familyRaw) ??
    parseSteelFamily(familyRaw)

  if (!features) return null

  return makeResult(familyRaw, shankType, sizeRaw, features)
}

function calculateHeadSizeMm(
  headPx: number,
  shankPx: number,
  shankType: string,
): number | null {
  const shankDiam = SHANK_DIAMETERS_MM[shankType]
  if (!shankDiam || shankPx === 0) return null
  const rawMm = (headPx / shankPx) * shankDiam
  return ISO_SIZES_MM.reduce((a, b) =>
    Math.abs(b - rawMm) < Math.abs(a - rawMm) ? b : a,
  )
}

// Kept for backward compatibility with any existing imports
const FAMILY_MAP: Record<string, FamilyFeatures> = {
  'H1':    { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H2':    { shape_family: 'inverted_cone',      material: 'tungsten_carbide', grit_ring_color: null },
  'H7':    { shape_family: 'pear',               material: 'tungsten_carbide', grit_ring_color: null },
  'H59':   { shape_family: 'cylinder',           material: 'tungsten_carbide', grit_ring_color: null },
  '801':   { shape_family: 'round',              material: 'diamond',          grit_ring_color: 'blue'  },
  '8801':  { shape_family: 'round',              material: 'diamond',          grit_ring_color: 'red'   },
  '6801':  { shape_family: 'round',              material: 'diamond',          grit_ring_color: 'green' },
  '837':   { shape_family: 'cylinder',           material: 'diamond',          grit_ring_color: 'blue'  },
  '847':   { shape_family: 'tapered_flat_end',   material: 'diamond',          grit_ring_color: 'blue'  },
  '856':   { shape_family: 'tapered_round_end',  material: 'diamond',          grit_ring_color: 'blue'  },
  'KP6801':{ shape_family: 'round',              material: 'diamond_diao',     grit_ring_color: 'green' },
  'KP8801':{ shape_family: 'round',              material: 'diamond_diao',     grit_ring_color: 'red'   },
}

export { parseKometCode, calculateHeadSizeMm, FAMILY_MAP }
export type { ParsedFeatures, FamilyFeatures }
