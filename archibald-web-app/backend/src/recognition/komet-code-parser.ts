type ParsedFeatures = {
  shape_family:      string | null
  material:          string | null
  grit_ring_color:   string | null
  family_code:       string
  shank_type:        string
  shank_diameter_mm: number
  head_size_code:    string
  head_size_mm:      number
};

const SHANK_TYPE_MAP: Record<string, string> = {
  '314': 'fg',
  '313': 'fgs',
  '315': 'fgl',
  '316': 'fgxl',
  '204': 'ca',
};

const SHANK_DIAMETER_MAP: Record<string, number> = {
  '314': 1.6, '313': 1.6, '315': 1.6, '316': 1.6,
  '204': 2.35,
};

type FamilyFeatures = {
  shape_family:    string
  material:        string
  grit_ring_color: string | null
};

const FAMILY_MAP: Record<string, FamilyFeatures> = {
  // Tungsten Carbide
  'H1':    { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H1S':   { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H1SE':  { shape_family: 'round',             material: 'tungsten_carbide', grit_ring_color: null },
  'H7':    { shape_family: 'pear',              material: 'tungsten_carbide', grit_ring_color: null },
  'H7S':   { shape_family: 'pear',              material: 'tungsten_carbide', grit_ring_color: null },
  'H2':    { shape_family: 'inverted_cone',     material: 'tungsten_carbide', grit_ring_color: null },
  'H21R':  { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H23R':  { shape_family: 'tapered_round_end', material: 'tungsten_carbide', grit_ring_color: null },
  'H59':   { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H11':   { shape_family: 'flame',             material: 'tungsten_carbide', grit_ring_color: null },
  'H12':   { shape_family: 'torpedo',           material: 'tungsten_carbide', grit_ring_color: null },
  'H4':    { shape_family: 'wheel',             material: 'tungsten_carbide', grit_ring_color: null },
  'H6':    { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  'H64':   { shape_family: 'cylinder',          material: 'tungsten_carbide', grit_ring_color: null },
  // Diamond standard (grit inferred from numeric prefix)
  '801':   { shape_family: 'round',              material: 'diamond', grit_ring_color: 'blue'   },
  '8801':  { shape_family: 'round',              material: 'diamond', grit_ring_color: 'red'    },
  '6801':  { shape_family: 'round',              material: 'diamond', grit_ring_color: 'green'  },
  '5801':  { shape_family: 'round',              material: 'diamond', grit_ring_color: 'black'  },
  '801UF': { shape_family: 'round',              material: 'diamond', grit_ring_color: 'white'  },
  '801EF': { shape_family: 'round',              material: 'diamond', grit_ring_color: 'yellow' },
  '837':   { shape_family: 'cylinder',           material: 'diamond', grit_ring_color: 'blue'   },
  '8837':  { shape_family: 'cylinder',           material: 'diamond', grit_ring_color: 'red'    },
  '6837':  { shape_family: 'cylinder',           material: 'diamond', grit_ring_color: 'green'  },
  '847':   { shape_family: 'tapered_round_end',  material: 'diamond', grit_ring_color: 'blue'   },
  '8847':  { shape_family: 'tapered_round_end',  material: 'diamond', grit_ring_color: 'red'    },
  '856':   { shape_family: 'pear',               material: 'diamond', grit_ring_color: 'blue'   },
  '8856':  { shape_family: 'pear',               material: 'diamond', grit_ring_color: 'red'    },
  '881':   { shape_family: 'cylinder',           material: 'diamond', grit_ring_color: 'blue'   },
  // Diamond DIAO (rose-gold)
  'KP6801': { shape_family: 'round',             material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6837': { shape_family: 'cylinder',          material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6881': { shape_family: 'cylinder',          material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6847': { shape_family: 'tapered_round_end', material: 'diamond_diao', grit_ring_color: 'green' },
  'KP6856': { shape_family: 'pear',              material: 'diamond_diao', grit_ring_color: 'green' },
  'KP8801': { shape_family: 'round',             material: 'diamond_diao', grit_ring_color: 'red'   },
};

// ISO standard head sizes in mm
const ISO_SIZES_MM = [
  0.5, 0.6, 0.7, 0.8, 0.9, 1.0,
  1.2, 1.4, 1.6, 1.8, 2.1, 2.3,
  2.5, 2.7, 2.9, 3.1, 3.5,
];

const SHANK_DIAMETERS_MM: Record<string, number> = {
  fg: 1.6, fgs: 1.6, fgl: 1.6, fgxl: 1.6,
  ca: 2.35,
};

function parseKometCode(productId: string): ParsedFeatures | null {
  const match = productId.match(/^(.+?)\.(\d{3})\.(\d{3})$/);
  if (!match) return null;
  const [, familyCode, shankCode, sizeCode] = match;
  const features = FAMILY_MAP[familyCode];
  if (!features) return null;

  return {
    ...features,
    family_code:       familyCode,
    shank_type:        SHANK_TYPE_MAP[shankCode] ?? 'fg',
    shank_diameter_mm: SHANK_DIAMETER_MAP[shankCode] ?? 1.6,
    head_size_code:    sizeCode,
    head_size_mm:      parseInt(sizeCode, 10) / 10,
  };
}

function calculateHeadSizeMm(
  headPx: number,
  shankPx: number,
  shankType: string,
): number | null {
  const shankDiam = SHANK_DIAMETERS_MM[shankType];
  if (!shankDiam || shankPx === 0) return null;
  const rawMm = (headPx / shankPx) * shankDiam;
  return ISO_SIZES_MM.reduce((a, b) =>
    Math.abs(b - rawMm) < Math.abs(a - rawMm) ? b : a,
  );
}

export { parseKometCode, calculateHeadSizeMm, FAMILY_MAP };
export type { ParsedFeatures, FamilyFeatures };
