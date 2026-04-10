export type KometFeatures = {
  material:        string
  shape:           string
  shankType:       string
  shankDiameterMm: number
  headDiameterMm:  number
  gritLabel?:      string
}

type FamilyInfo = {
  material:   string
  shape:      string
  gritLabel?: string
}

type ShankInfo = {
  type:       string
  diameterMm: number
}

// Ordinati dal prefisso più lungo al più corto per prevenire match parziali errati
const FAMILY_MAP: Array<[string, FamilyInfo]> = [
  ['H1SE',   { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H1S',    { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H1',     { material: 'Carburo di tungsteno', shape: 'Testa tonda' }],
  ['H7S',    { material: 'Carburo di tungsteno', shape: 'Testa a pera' }],
  ['H7',     { material: 'Carburo di tungsteno', shape: 'Testa a pera' }],
  ['H21R',   { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  ['H23R',   { material: 'Carburo di tungsteno', shape: 'Cilindro con estremità tonda' }],
  ['H23L',   { material: 'Carburo di tungsteno', shape: 'Cilindro con estremità tonda' }],
  ['H2',     { material: 'Carburo di tungsteno', shape: 'Cono rovesciato' }],
  ['H48L',   { material: 'Carburo di tungsteno', shape: 'Torpedine' }],
  ['H59L',   { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  ['H59',    { material: 'Carburo di tungsteno', shape: 'Cilindro' }],
  // Diamantata — prefissi più lunghi prima
  ['KP6801', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['KP6837', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['KP6881', { material: 'Diamantata DIAO (oro-rosa)', shape: 'Cilindro',      gritLabel: 'Grana grossolana (anello verde)' }],
  ['801UF',  { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana ultra fine (anello bianco)' }],
  ['801EF',  { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana extra fine (anello giallo)' }],
  ['8801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana fine (anello rosso)' }],
  ['6801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana grossolana (anello verde)' }],
  ['5801',   { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana molto grossolana (anello nero)' }],
  ['801',    { material: 'Diamantata',               shape: 'Testa tonda',   gritLabel: 'Grana standard (anello blu)' }],
  ['879',    { material: 'Diamantata',               shape: 'Torpedine',     gritLabel: 'Grana standard (anello blu)' }],
  ['856',    { material: 'Diamantata',               shape: 'Torpedine',     gritLabel: 'Grana standard (anello blu)' }],
  ['862',    { material: 'Diamantata',               shape: 'Fiamma',        gritLabel: 'Grana standard (anello blu)' }],
  ['863',    { material: 'Diamantata',               shape: 'Fiamma',        gritLabel: 'Grana standard (anello blu)' }],
  ['837',    { material: 'Diamantata',               shape: 'Cilindro',      gritLabel: 'Grana standard (anello blu)' }],
  ['811',    { material: 'Diamantata',               shape: 'Testa a pera',  gritLabel: 'Grana standard (anello blu)' }],
]

const SHANK_MAP: Record<string, ShankInfo> = {
  '314': { type: 'Turbina (FG)',               diameterMm: 1.6  },
  '313': { type: 'Turbina corta (FGS)',        diameterMm: 1.6  },
  '315': { type: 'Turbina lunga (FGL)',        diameterMm: 1.6  },
  '316': { type: 'Turbina extra-lunga (FGXL)', diameterMm: 1.6 },
  '204': { type: 'Contrangolo (CA)',           diameterMm: 2.35 },
}

function getFamilyInfo(familyCode: string): FamilyInfo | null {
  for (const [prefix, info] of FAMILY_MAP) {
    if (familyCode === prefix || familyCode.startsWith(prefix)) {
      return info
    }
  }
  return null
}

export function parseKometFeatures(productId: string): KometFeatures | null {
  const parts = productId.split('.')
  if (parts.length < 3) return null

  const [familyCode, shankCode, sizeCode] = parts

  const sizeNum = parseInt(sizeCode, 10)
  if (isNaN(sizeNum)) return null

  const shankInfo = SHANK_MAP[shankCode]
  if (!shankInfo) return null

  const familyInfo = getFamilyInfo(familyCode)
  if (!familyInfo) return null

  return {
    material:        familyInfo.material,
    shape:           familyInfo.shape,
    shankType:       shankInfo.type,
    shankDiameterMm: shankInfo.diameterMm,
    headDiameterMm:  sizeNum / 10,
    ...(familyInfo.gritLabel !== undefined ? { gritLabel: familyInfo.gritLabel } : {}),
  }
}
