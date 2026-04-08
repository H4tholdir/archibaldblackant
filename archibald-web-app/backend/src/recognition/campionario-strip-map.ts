import type { PathLike } from 'node:fs'

export const CAMPIONARIO_BASE_DIR = '/app/komet-campionari'

export type StripEntry = {
  path:     string   // relative to CAMPIONARIO_BASE_DIR
  kometUrl: string   // public komet.it CDN URL for this strip image
  families: string[] // core family codes visible with a label in this strip
  label:    string   // description for the Claude prompt
}

// MTB457 = lab HP strips (shank 104).  All instruments labeled with REF (family) + size.
// MTB541 = studio FG/HP strips.  Instruments labeled with family code.
// Only strips useful for visual disambiguation are included.
const MTB541      = 'mtb541-diamantate-ct/campionario-diamantate-e-frese-carburo-tungsteno-particolari'
const MTB457      = 'mtb457-diamantate-lab/mtb457-particolare'
const MTB457_BASE = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare'
const MTB541_BASE = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari'

export const CAMPIONARIO_STRIPS: StripEntry[] = [
  // ── MTB457 (lab HP, shank 104) ────────────────────────────────────────────

  {
    path:     `${MTB457}-06.jpg`,
    kometUrl: `${MTB457_BASE}-06.jpg`,
    families: ['860', '862', '863', '879', '880', '892', '368', '379', '390'],
    label:    'MTB457 strip 06 (HP lab): 860/862/863 flame vs 879 torpedo chamfer, side-by-side with REF labels',
  },
  {
    path:     `${MTB457}-02.jpg`,
    kometUrl: `${MTB457_BASE}-02.jpg`,
    families: ['807', '805', '830', '835', '836', '837', '842'],
    label:    'MTB457 strip 02 (HP lab): 807 inverted cone and cylindrical shapes',
  },
  {
    path:     `${MTB457}-01.jpg`,
    kometUrl: `${MTB457_BASE}-01.jpg`,
    families: ['801', '6801', '805'],
    label:    'MTB457 strip 01 (HP lab): 801 sphere/ball',
  },
  {
    path:     `${MTB457}-03.jpg`,
    kometUrl: `${MTB457_BASE}-03.jpg`,
    families: ['845', '846', '847', '848', '849', '850', '855', '856', '858', '859'],
    label:    'MTB457 strip 03 (HP lab): tapered/conic (845-856) and lance (858-859)',
  },
  {
    path:     `${MTB457}-05.jpg`,
    kometUrl: `${MTB457_BASE}-05.jpg`,
    families: ['ZR8863', 'ZR8862', 'ZR8856', 'ZR8881', 'ZR8850', 'ZR8379'],
    label:    'MTB457 strip 05 (HP lab): ZR variants — ZR8863 flame, ZR8879 torpedo',
  },

  // ── MTB541 (studio FG/HP) ─────────────────────────────────────────────────

  {
    path:     `${MTB541}-36.jpg`,
    kometUrl: `${MTB541_BASE}-36.jpg`,
    families: ['863', '864'],
    label:    'MTB541 strip 36 (studio): 863 long flame (fiamma lunga) — continuously tapering to sharp point',
  },
  {
    path:     `${MTB541}-25.jpg`,
    kometUrl: `${MTB541_BASE}-25.jpg`,
    families: ['879', '851', '857'],
    label:    'MTB541 strip 25 (studio): 879 torpedo chamfer (parallele Hohlkehl) — parallel body + blunt chamfer tip',
  },
  {
    path:     `${MTB541}-35.jpg`,
    kometUrl: `${MTB541_BASE}-35.jpg`,
    families: ['862'],
    label:    'MTB541 strip 35 (studio): 862 flame',
  },
  {
    path:     `${MTB541}-34.jpg`,
    kometUrl: `${MTB541_BASE}-34.jpg`,
    families: ['860', '889'],
    label:    'MTB541 strip 34 (studio): 860 short flame, 889 needle',
  },
  {
    path:     `${MTB541}-06.jpg`,
    kometUrl: `${MTB541_BASE}-06.jpg`,
    families: ['805', '807', '806', '813'],
    label:    'MTB541 strip 06 (studio): 807 inverted cone (cono rovescio), 805, 813 diabolo',
  },
  {
    path:     `${MTB541}-24.jpg`,
    kometUrl: `${MTB541_BASE}-24.jpg`,
    families: ['878'],
    label:    'MTB541 strip 24 (studio): 878 torpedo chamfer medium length',
  },
  {
    path:     `${MTB541}-23.jpg`,
    kometUrl: `${MTB541_BASE}-23.jpg`,
    families: ['875', '876', '877'],
    label:    'MTB541 strip 23 (studio): 875-877 short torpedo chamfer',
  },
  {
    path:     `${MTB541}-30.jpg`,
    kometUrl: `${MTB541_BASE}-30.jpg`,
    families: ['878K'],
    label:    'MTB541 strip 30 (studio): 878K conical chamfer (chamfer CONICO — differs from 879 which is parallel)',
  },
  {
    path:     `${MTB541}-31.jpg`,
    kometUrl: `${MTB541_BASE}-31.jpg`,
    families: ['879K'],
    label:    'MTB541 strip 31 (studio): 879K conical chamfer',
  },
  {
    path:     `${MTB541}-20.jpg`,
    kometUrl: `${MTB541_BASE}-20.jpg`,
    families: ['858', '859'],
    label:    'MTB541 strip 20 (studio): 858-859 lance',
  },
  {
    path:     `${MTB541}-21.jpg`,
    kometUrl: `${MTB541_BASE}-21.jpg`,
    families: ['880'],
    label:    'MTB541 strip 21 (studio): 880 cylinder round tip',
  },
  {
    path:     `${MTB541}-03.jpg`,
    kometUrl: `${MTB541_BASE}-03.jpg`,
    families: ['801'],
    label:    'MTB541 strip 03 (studio): 801 ball/sphere',
  },
]

/**
 * Given the family codes extracted from disambiguation candidates,
 * return the most relevant campionario strips (max 2).
 *
 * Priority:
 *   1. Strips showing ≥2 candidate families (direct side-by-side comparison)
 *   2. Strips showing exactly 1 candidate family (single reference)
 * Within each tier, strips are ordered by the number of matching families.
 */
export function findRelevantStrips(candidateFamilyCodes: string[]): StripEntry[] {
  const scored = CAMPIONARIO_STRIPS.flatMap(strip => {
    const matches = candidateFamilyCodes.filter(family => strip.families.includes(family)).length
    return matches > 0 ? [{ strip, matches }] : []
  }).sort((a, b) => b.matches - a.matches)

  // Prefer the strip that covers the most candidates simultaneously,
  // add a second strip only if it covers a different candidate not yet covered.
  const result: StripEntry[] = []
  const coveredFamilies = new Set<string>()

  for (const { strip } of scored) {
    if (result.length >= 2) break
    const newFamilies = strip.families.filter(f => candidateFamilyCodes.includes(f) && !coveredFamilies.has(f))
    if (newFamilies.length > 0) {
      result.push(strip)
      newFamilies.forEach(f => coveredFamilies.add(f))
    }
  }

  return result
}

// Re-export the path type so callers can construct full paths without string concatenation
export function stripFullPath(relativePath: string): PathLike {
  return `${CAMPIONARIO_BASE_DIR}/${relativePath}` as PathLike
}
