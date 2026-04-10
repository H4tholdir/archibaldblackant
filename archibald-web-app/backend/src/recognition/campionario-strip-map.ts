import type { PathLike } from 'node:fs'

export const CAMPIONARIO_BASE_DIR = '/app/komet-campionari'

export type StripEntry = {
  path:     string   // relative to CAMPIONARIO_BASE_DIR
  kometUrl: string   // public komet.it CDN URL ('' if unknown)
  families: string[] // family code prefixes visible in this strip
  label:    string   // description for the Claude prompt
}

// ── VPS path segments (relative to CAMPIONARIO_BASE_DIR) ─────────────────────
const MTB457 = 'mtb457-diamantate-lab/mtb457-particolare'
const MTB541 = 'mtb541-diamantate-ct/campionario-diamantate-e-frese-carburo-tungsteno-particolari'
const MTB566 = 'mtb566-diao/mtb566-particolare'
const MTB524 = 'mtb524-endodonzia/mtb524-particolare'
const MTB456 = 'mtb456-fresoni-lab/mtb456-particolare'
const MTB137 = 'mtb137-frese-ct-lab/campionario-laboratorio-frese-in-carburo-di-tungsteno-particolari'
const MTB161 = 'mtb161-dischi-lab/campionario-laboratorio-dischi-diamantati-particolari'
const MTB335 = 'mtb335-fresaggio-lab/campionario-fresaggio-laboratorio-particolari'
const MTB372 = 'mtb372-sonico/campionario-punte-soniche-particolari'
const MTB450 = 'mtb450-ultrasoniche/campionario-punte-ultrasoniche-particolari'
const MTB159 = 'mtb159-gommini-studio/campionario-gommini-studio-particolari'
const MTB325 = 'mtb325-gommini-lab/campionario-gommini-laboratorio-particolari'

// ── CDN base URLs (komet.it) — known only for MTB457 and MTB541 ───────────────
const MTB457_CDN = 'https://www.komet.it/uploads/repositoryfiles/images/2024/02/mtb457-particolare'
const MTB541_CDN = 'https://www.komet.it/uploads/repositoryfiles/images/2020/04/campionario-diamantate-e-frese-carburo-tungsteno-particolari'

export const CAMPIONARIO_STRIPS: StripEntry[] = [

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB457 — Diamantate Laboratorio HP (shank 104)
  // Each strip shows: Größe (size) | REF (family) | Schaft (104=HP)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB457}-01.jpg`,
    kometUrl: `${MTB457_CDN}-01.jpg`,
    families: ['801', '6801', '8801', '8801EF', '805'],
    label:    'MTB457 strip 01 (HP lab): 801 sphere/ball — all sizes with HP shank 104',
  },
  {
    path:     `${MTB457}-02.jpg`,
    kometUrl: `${MTB457_CDN}-02.jpg`,
    families: ['805A', '807', '830RL', '830', '835', '836', '837', '842', '842R'],
    label:    'MTB457 strip 02 (HP lab): 807 inverted cone (cono rovescio lungo), 835-842 cylinder shapes',
  },
  {
    path:     `${MTB457}-03.jpg`,
    kometUrl: `${MTB457_CDN}-03.jpg`,
    families: ['845', '846', '847', '848', '849', '850', '855', '856', '858', '859'],
    label:    'MTB457 strip 03 (HP lab): 845-848 tapered flat-tip, 849-856 tapered round-tip, 858-859 lance',
  },
  {
    path:     `${MTB457}-04.jpg`,
    kometUrl: `${MTB457_CDN}-04.jpg`,
    families: ['830', '835', '836', '837', '842', '845', '846', '847', '848', '801'],
    label:    'MTB457 strip 04 (HP lab): mixed forms — cylinders, pear, tapered HP variants',
  },
  {
    path:     `${MTB457}-05.jpg`,
    kometUrl: `${MTB457_CDN}-05.jpg`,
    families: ['ZR8863', 'ZR8862', 'ZR8856', 'ZR8881', 'ZR8850', 'ZR8379', 'ZR8801L', 'ZR8390', 'ZR8849', 'ZR972', 'ZR943'],
    label:    'MTB457 strip 05 (HP lab): ZR variants — ZR8863 flame, ZR8879 torpedo, ZR8801 ball',
  },
  {
    path:     `${MTB457}-06.jpg`,
    kometUrl: `${MTB457_CDN}-06.jpg`,
    families: ['8860', '860', '862', '863', '8867', '879', '880', '892', '368', '379', '390'],
    label:    'MTB457 strip 06 (HP lab): 860/862/863 flame vs 879 torpedo chamfer side-by-side — THE KEY DISAMBIGUATION STRIP',
  },
  {
    path:     `${MTB457}-07.jpg`,
    kometUrl: `${MTB457_CDN}-07.jpg`,
    families: ['H280', 'H281', 'H282', 'H283', 'H284'],
    label:    'MTB457 strip 07 (HP lab): H280-H284 CT burs for lab HP use',
  },
  {
    path:     `${MTB457}-08.jpg`,
    kometUrl: `${MTB457_CDN}-08.jpg`,
    families: ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H21', 'H31'],
    label:    'MTB457 strip 08 (HP lab): H1-H6 basic CT burs with HP shank',
  },
  {
    path:     `${MTB457}-09.jpg`,
    kometUrl: `${MTB457_CDN}-09.jpg`,
    families: ['H219', 'H219A', 'H219B', 'H79SGFA', 'H251SGFA', 'H30E', 'K79ACR', 'K251ACR'],
    label:    'MTB457 strip 09 (HP lab): special shapes and sets for HP lab use',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB541 — Diamantate e Frese CT Studio (FG/HP)
  // Each strip shows: family_code + size + grit dot colour
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Pag. 1 — Conservativa: pera, sfera, sfera-collo, cono rovescio ──────────
  {
    path:     `${MTB541}-01.jpg`,
    kometUrl: `${MTB541_CDN}-01.jpg`,
    families: ['822', '6830', '830', '8830', '830EF', '5830'],
    label:    'MTB541 strip 01 (studio): 822 mini-pear, 830 pear — all grit variants',
  },
  {
    path:     `${MTB541}-02.jpg`,
    kometUrl: `${MTB541_CDN}-02.jpg`,
    families: ['5830L', 'S6830L', '830L', '8830L', '830LEF', 'S6830RL', '830RL', '8830RL'],
    label:    'MTB541 strip 02 (studio): 830L pear long, 830RL pear-round long variants',
  },
  {
    path:     `${MTB541}-03.jpg`,
    kometUrl: `${MTB541_CDN}-03.jpg`,
    families: ['5801', '6801', 'S6801', '801', '8801'],
    label:    'MTB541 strip 03 (studio): 801 ball/sphere — all sizes and grit',
  },
  {
    path:     `${MTB541}-04.jpg`,
    kometUrl: `${MTB541_CDN}-04.jpg`,
    families: ['8801', '801EF', '801UF', 'S6801L', '825', 'H59', 'K59', 'H132A'],
    label:    'MTB541 strip 04 (studio): 801EF/UF ultra-fine spheres, 825, CT H59/K59/H132A',
  },
  {
    path:     `${MTB541}-05.jpg`,
    kometUrl: `${MTB541_CDN}-05.jpg`,
    families: ['ZR6801', 'ZR801L', 'ZR8801L', '6802', '802'],
    label:    'MTB541 strip 05 (studio): ZR801 zirconia ball, 802 ball-with-neck',
  },
  {
    path:     `${MTB541}-06.jpg`,
    kometUrl: `${MTB541_CDN}-06.jpg`,
    families: ['6805', '805', '807', 'ZR6807', '6806', '806', '813'],
    label:    'MTB541 strip 06 (studio): 807 inverted cone (cono rovescio), 805, 813 diabolo/hourglass',
  },
  {
    path:     `${MTB541}-07-corretto.jpg`,
    kometUrl: `${MTB541_CDN}-07.jpg`,
    families: ['889M', '838M', '830M', '8830M', '953M', '8953M', 'Set4383'],
    label:    'MTB541 strip 07 (studio): mikropräparation set — 889M needle, 838M cylinder, 830M pear micro',
  },

  // ── Pag. 2 — Conservativa: cilindri KR, coniche KR ──────────────────────────
  {
    path:     `${MTB541}-08.jpg`,
    kometUrl: `${MTB541_CDN}-08.jpg`,
    families: ['6835KR', 'S6835KR', '835KR', '8835KR', '835KREF', '835'],
    label:    'MTB541 strip 08 (studio): 835KR cylinder flat-tip rounded edge — all grit',
  },
  {
    path:     `${MTB541}-09.jpg`,
    kometUrl: `${MTB541_CDN}-09.jpg`,
    families: ['6836KR', 'S6836KR', '836KR', '8836KR', 'S6837KR', '837KR', '837KREF', '842KR'],
    label:    'MTB541 strip 09 (studio): 836KR/837KR cylinders KR, 842KR mixed cylinder',
  },
  {
    path:     `${MTB541}-10.jpg`,
    kometUrl: `${MTB541_CDN}-10.jpg`,
    families: ['S6845KR', '845KR', '8845KR', '845KREF', '846KR', '8846KR', '846KREF'],
    label:    'MTB541 strip 10 (studio): 845KR/846KR tapered flat-tip KR — PrepMarker included',
  },
  {
    path:     `${MTB541}-11.jpg`,
    kometUrl: `${MTB541_CDN}-11.jpg`,
    families: ['S6847KR', '847KR', '8847KR', '847KREF'],
    label:    'MTB541 strip 11 (studio): 847KR tapered flat-tip KR (8mm) — all grit',
  },
  {
    path:     `${MTB541}-12.jpg`,
    kometUrl: `${MTB541_CDN}-12.jpg`,
    families: ['S6848KR', '848KR', '8848KR', '8372P', '8372PL', '845KRD', '6847KRD'],
    label:    'MTB541 strip 12 (studio): 848KR tapered long KR, 8372P dual-angle, 845KRD depth-check',
  },
  {
    path:     `${MTB541}-13.jpg`,
    kometUrl: `${MTB541_CDN}-13.jpg`,
    families: ['6845', '845', '6846', '846', '8846', '5847', '6847', '847', '8847'],
    label:    'MTB541 strip 13 (studio): 845-847 tapered flat-tip standard (sharp edge, no KR)',
  },
  {
    path:     `${MTB541}-14.jpg`,
    kometUrl: `${MTB541_CDN}-14.jpg`,
    families: ['5848', '6848', '8848', '848'],
    label:    'MTB541 strip 14 (studio): 848 tapered long flat-tip — all sizes',
  },

  // ── Pag. 3 — Rosette ceramica + CT speciali ──────────────────────────────────
  {
    path:     `${MTB541}-15.jpg`,
    kometUrl: `${MTB541_CDN}-15.jpg`,
    families: ['K1SM', 'PolyBur', 'P1'],
    label:    'MTB541 strip 15 (studio): K1SM ceramic rosette, PolyBur/P1 polymer bur',
  },
  {
    path:     `${MTB541}-16-corretto.jpg`,
    kometUrl: `${MTB541_CDN}-16.jpg`,
    families: ['H1SEM', 'H1SM'],
    label:    'MTB541 strip 16 (studio): H1SEM CT round-end mill, H1SM CT sharp mill',
  },
  {
    path:     `${MTB541}-17.jpg`,
    kometUrl: `${MTB541_CDN}-17.jpg`,
    families: ['H1', 'H1SE', 'H1S', 'H2'],
    label:    'MTB541 strip 17 (studio): H1/H2 CT burs, H1SE straight end, H1S tapered',
  },
  {
    path:     `${MTB541}-18.jpg`,
    kometUrl: `${MTB541_CDN}-18.jpg`,
    families: ['H4MCL', 'H4MC', 'H4MCXL', 'H4MCXXL', '4ZR', '4ZRS'],
    label:    'MTB541 strip 18 (studio): H4MC/H4MCL crown cutter (tagliacorone), 4ZR zirconia crown remover',
  },
  {
    path:     `${MTB541}-19-corretto.jpg`,
    kometUrl: `${MTB541_CDN}-19.jpg`,
    families: ['H32', '5985'],
    label:    'MTB541 strip 19 (studio): H32 CT bur, 5985 restoration removal',
  },

  // ── Pag. 4 — Lance, cilindri testa tonda, chamfer corti ──────────────────────
  {
    path:     `${MTB541}-20.jpg`,
    kometUrl: `${MTB541_CDN}-20.jpg`,
    families: ['6858', '858', '8858', '858EF', '858UF', '6859', '859', '8859', '859EF'],
    label:    'MTB541 strip 20 (studio): 858-859 lance (Separierer) — both lengths and grit',
  },
  {
    path:     `${MTB541}-21.jpg`,
    kometUrl: `${MTB541_CDN}-21.jpg`,
    families: ['6838', '838', '8838', 'S6880', '880', '8880', '880P'],
    label:    'MTB541 strip 21 (studio): 880 cylinder round-tip, 838 cylinder — chamfer body + rounded tip',
  },
  {
    path:     `${MTB541}-22.jpg`,
    kometUrl: `${MTB541_CDN}-22.jpg`,
    families: ['881', '8881', '881EF', '881P', 'S6882', '882', '8882', 'S6882L', '8882L'],
    label:    'MTB541 strip 22 (studio): 881-882 cylinder round-tip (longer than 880)',
  },
  {
    path:     `${MTB541}-23.jpg`,
    kometUrl: `${MTB541_CDN}-23.jpg`,
    families: ['875', '876', '8876', '6877', 'S6877', '877', '8877'],
    label:    'MTB541 strip 23 (studio): 875-877 short chamfer — parallel body + chamfer tip, L 4-6mm',
  },
  {
    path:     `${MTB541}-24.jpg`,
    kometUrl: `${MTB541_CDN}-24.jpg`,
    families: ['5878', 'S6878', '6878', '878', '8878', '878EF', '6878P', '8878P'],
    label:    'MTB541 strip 24 (studio): 878 chamfer cylinder medium length — parallel body + chamfer, L 8mm',
  },
  {
    path:     `${MTB541}-25.jpg`,
    kometUrl: `${MTB541_CDN}-25.jpg`,
    families: ['S6879', '6879', '879', '8879', '879EF', '879L', '8879L', '851', '857'],
    label:    'MTB541 strip 25 (studio): 879 torpedo chamfer LONG (Parallele Hohlkehl) — parallel body + blunt chamfer, L 10mm',
  },

  // ── Pag. 5 — Faccette, coniche varie ─────────────────────────────────────────
  {
    path:     `${MTB541}-26.jpg`,
    kometUrl: `${MTB541_CDN}-26.jpg`,
    families: ['868BP', '868B', '868', '8868', '834', '6844'],
    label:    'MTB541 strip 26 (studio): 868 veneer/faccetta shapes, 834/6844 cylinder with shoulder',
  },
  {
    path:     `${MTB541}-27.jpg`,
    kometUrl: `${MTB541_CDN}-27.jpg`,
    families: ['6849', '849', '8849P', 'KT', '5855', '855', '8855', '855D'],
    label:    'MTB541 strip 27 (studio): 849 tapered round-tip short, 855 tapered round-tip, KT',
  },
  {
    path:     `${MTB541}-28.jpg`,
    kometUrl: `${MTB541_CDN}-28.jpg`,
    families: ['5856', 'S6856', '6856', '856', '8856', '856EF', '6856P', '856P', '8856P'],
    label:    'MTB541 strip 28 (studio): 856 tapered round-tip standard — all grit, plain and P variants',
  },
  {
    path:     `${MTB541}-29.jpg`,
    kometUrl: `${MTB541_CDN}-29.jpg`,
    families: ['S6856XL', '8856XL', '5850', '6850', 'S6850', '850', '8850'],
    label:    'MTB541 strip 29 (studio): 856XL extra-long, 850 tapered round-tip long',
  },
  {
    path:     `${MTB541}-30.jpg`,
    kometUrl: `${MTB541_CDN}-30.jpg`,
    families: ['5878K', 'S6878K', '6878K', '878K', '8878K', '878KP', '8878KP'],
    label:    'MTB541 strip 30 (studio): 878K chamfer CONICO (Konische Hohlkehl) — tapered body + chamfer ← differs from 879 parallel!',
  },
  {
    path:     `${MTB541}-31.jpg`,
    kometUrl: `${MTB541_CDN}-31.jpg`,
    families: ['5879K', '6879K', 'S6879K', '879K', '8879K', '879KP', '8879KP'],
    label:    'MTB541 strip 31 (studio): 879K chamfer conico LUNGO — tapered body (wider body than 878K)',
  },
  {
    path:     `${MTB541}-32.jpg`,
    kometUrl: `${MTB541_CDN}-32.jpg`,
    families: ['6884', '884', '8884', '6885', '885', '8885', '6886', '886', '8886', 'S6886K'],
    label:    'MTB541 strip 32 (studio): 884-886 divergent chamfer shapes (shoulder burs)',
  },
  {
    path:     `${MTB541}-33.jpg`,
    kometUrl: `${MTB541_CDN}-33.jpg`,
    families: ['6852', '852', '8852', '852EF', '852UF', '8955', '955EF', '8956', '956EF', '8957'],
    label:    'MTB541 strip 33 (studio): 852 lens shape, 955-957 special shapes',
  },

  // ── Pag. 6 — Fiamme, oliva, football ─────────────────────────────────────────
  {
    path:     `${MTB541}-34.jpg`,
    kometUrl: `${MTB541_CDN}-34.jpg`,
    families: ['6883', '883', '6889', '889', '8889', '6860', '860', '8860', '860EF'],
    label:    'MTB541 strip 34 (studio): 860 short flame, 889 needle (fiammetta/ago), 883',
  },
  {
    path:     `${MTB541}-35.jpg`,
    kometUrl: `${MTB541_CDN}-35.jpg`,
    families: ['5862', 'S6862', '6862', '862', '8862', '862EF', '862UF'],
    label:    'MTB541 strip 35 (studio): 862 flame (L 8mm) — all variants',
  },
  {
    path:     `${MTB541}-36.jpg`,
    kometUrl: `${MTB541_CDN}-36.jpg`,
    families: ['5863', 'S6863', '6863', '863', '8863', '863EF', '863UF', 'H48XLQ', '864', '8864', '6863D', '8863D'],
    label:    'MTB541 strip 36 (studio): 863 long flame (fiamma lunga, L 10mm) + 864 extra-long flame — continuously tapering to sharp point',
  },
  {
    path:     `${MTB541}-37.jpg`,
    kometUrl: `${MTB541_CDN}-37.jpg`,
    families: ['811', '370', '8370', '5909', '6909', '909'],
    label:    'MTB541 strip 37 (studio): 811/370 OccluShaper (occlusal modelling), 909 special shape',
  },
  {
    path:     `${MTB541}-38.jpg`,
    kometUrl: `${MTB541_CDN}-38.jpg`,
    families: ['899', '8899', 'DF1C', 'DF1', 'DF1F', 'DF1EF'],
    label:    'MTB541 strip 38 (studio): 899 diamond reciprocating, DF1 diamond file variants',
  },
  {
    path:     `${MTB541}-39.jpg`,
    kometUrl: `${MTB541_CDN}-39.jpg`,
    families: ['5368', 'S6368', '6368', '368', '8368', '368EF', '368UF', '8368L'],
    label:    'MTB541 strip 39 (studio): 368 football/oval shape — all grit and length variants',
  },
  {
    path:     `${MTB541}-40.jpg`,
    kometUrl: `${MTB541_CDN}-40.jpg`,
    families: ['5379', 'S6379', '6379', '379', '8379', '379EF', 'ZR8379', '390', '8380'],
    label:    'MTB541 strip 40 (studio): 379 olive/oval shape, 390 pomegranate, ZR8379 zirconia olive',
  },
  {
    path:     `${MTB541}-41.jpg`,
    kometUrl: `${MTB541_CDN}-41.jpg`,
    families: ['8972', '972EF', '973', '8973', '833A', '8833A', '8804', '8392'],
    label:    'MTB541 strip 41 (studio): 972-973 special shapes, 833A/8804 variants',
  },

  // ── Pag. 7 — Frese CT studio ─────────────────────────────────────────────────
  {
    path:     `${MTB541}-42.jpg`,
    kometUrl: `${MTB541_CDN}-42.jpg`,
    families: ['H1SEM', 'H1SE'],
    label:    'MTB541 strip 42 (studio CT): H1SEM round-end CT mill for conservative prep',
  },
  {
    path:     `${MTB541}-43.jpg`,
    kometUrl: `${MTB541_CDN}-43.jpg`,
    families: ['H11', 'H21', 'H21R'],
    label:    'MTB541 strip 43 (studio CT): H11/H21/H21R CT burs for general prep',
  },
  {
    path:     `${MTB541}-44.jpg`,
    kometUrl: `${MTB541_CDN}-44.jpg`,
    families: ['H31R', 'H31', 'H51', 'H52'],
    label:    'MTB541 strip 44 (studio CT): H31R/H51/H52 multilame CT burs for ceramic removal',
  },
  {
    path:     `${MTB541}-45.jpg`,
    kometUrl: `${MTB541_CDN}-45.jpg`,
    families: ['H281', 'H282', 'H283', 'H283E', 'H284', 'H281K', 'H282K', 'H283K', 'H284K', 'H336'],
    label:    'MTB541 strip 45 (studio CT): H281-H284 CT finishing burs — straight and KR variants',
  },
  {
    path:     `${MTB541}-46.jpg`,
    kometUrl: `${MTB541_CDN}-46.jpg`,
    families: ['H30L', 'H133', 'H33', 'H33L', 'H33R', 'H30'],
    label:    'MTB541 strip 46 (studio CT): H30L/H33 long CT burs for deep access prep',
  },
  {
    path:     `${MTB541}-47.jpg`,
    kometUrl: `${MTB541_CDN}-47.jpg`,
    families: ['H16', 'H17', 'H18', 'H7', 'H7S', 'H7L'],
    label:    'MTB541 strip 47 (studio CT): H16-H18 CT finishing burs, H7 multi-flute',
  },
  {
    path:     `${MTB541}-48.jpg`,
    kometUrl: `${MTB541_CDN}-48.jpg`,
    families: ['H48LQ', 'H48XLQ', 'H379Q', 'H390Q', 'H134Q', 'H135Q', 'H50AQ'],
    label:    'MTB541 strip 48 (studio CT): Q-series CT burs for composite finishing',
  },
  {
    path:     `${MTB541}-49.jpg`,
    kometUrl: `${MTB541_CDN}-49.jpg`,
    families: ['H71', 'H72', 'H41', 'H46', 'H47L', 'H245', 'H207', 'H297'],
    label:    'MTB541 strip 49 (studio CT): various metallic CT burs for lab and studio',
  },
  {
    path:     `${MTB541}-50-corretto.jpg`,
    kometUrl: `${MTB541_CDN}-50.jpg`,
    families: ['831', '8831', '832', '8832', '831EF', '8831L', '831LEF', '8832L', '832LEF', '190', '189', '227A', '227B'],
    label:    'MTB541 strip 50 (studio): 831-832 Paro-Diamanten (periodontal diamonds), 227A implant prep',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB566 — Diamantate DIAO (studio FG/HP)
  // DIAO = DIA (diamond) + O (ceramic spacer beads) — same shapes as standard
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB566}-01.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 01 (DIAO studio): DIAO pear and cylinder shapes — pink-gold ring with green band',
  },
  {
    path:     `${MTB566}-02.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 02 (DIAO studio): DIAO cylindrical and pear variants',
  },
  {
    path:     `${MTB566}-03.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 03 (DIAO studio): DIAO torpedo/chamfer shapes (879DIAO equivalent)',
  },
  {
    path:     `${MTB566}-04.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 04 (DIAO studio): DIAO flame shapes (860/863 DIAO equivalent)',
  },
  {
    path:     `${MTB566}-05.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 05 (DIAO studio): DIAO tapered and conical shapes',
  },
  {
    path:     `${MTB566}-06.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 06 (DIAO studio): DIAO ball and inverted-cone shapes',
  },
  {
    path:     `${MTB566}-07.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO', '811', '370'],
    label:    'MTB566 strip 07 (DIAO studio): DIAO OccluShaper (811/370) for occlusal modelling',
  },
  {
    path:     `${MTB566}-08.jpg`,
    kometUrl: '',
    families: ['DIAO', 'KPDIAO'],
    label:    'MTB566 strip 08 (DIAO studio): DIAO special sets and mixed shapes',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB524 — Endodonzia
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB524}-01.jpg`,
    kometUrl: '',
    families: ['H269QGK', 'H269GK', 'H1SML31', 'H1SML34', 'L31', 'L34', 'EndoExplorer'],
    label:    'MTB524 strip 01 (endo): EndoGuard H269QGK access bur, EndoTracer H1SML, L31/L34 explorers',
  },
  {
    path:     `${MTB524}-02.jpg`,
    kometUrl: '',
    families: ['EX1', 'EX1S', 'EX1L', 'EX2', 'EX2S', 'EX2L', '4664', 'G180', 'G180A'],
    label:    'MTB524 strip 02 (endo): EX1/EX2 endo explorers, G180 Gates Glidden, 4664 plugger',
  },
  {
    path:     `${MTB524}-03.jpg`,
    kometUrl: '',
    families: ['191', '183L', '183LB', '182', '196', '120D', '9107'],
    label:    'MTB524 strip 03 (endo): 191/183L reamers, 182 broach, 196 post drill, 9107 spreader',
  },
  {
    path:     `${MTB524}-04.jpg`,
    kometUrl: '',
    families: ['17521', '17525', '17121', '17125', '17131', '17321', '17325', '17331', '17421', '17425', '17431'],
    label:    'MTB524 strip 04 (endo): 171xx/172xx/173xx/174xx nickel-titanium hand files',
  },
  {
    path:     `${MTB524}-05.jpg`,
    kometUrl: '',
    families: ['PathGlider', 'PG03L21', 'PG03L25', 'PG03L31', 'F06L21', 'F06L25', 'F06L31', 'GPF06'],
    label:    'MTB524 strip 05 (endo): PathGlider, F06 Feather-Touch rotary files — glide path instruments',
  },
  {
    path:     `${MTB524}-06.jpg`,
    kometUrl: '',
    families: ['F04L21', 'F04L25', 'F04L31', 'GPF04', 'F360', 'FQ08L19', 'FQ03L21', 'FQ03L25', 'FQ03L31'],
    label:    'MTB524 strip 06 (endo): F04/F360 finishing files, FQ08/FQ03 FlexxFile Q rotary files',
  },
  {
    path:     `${MTB524}-07.jpg`,
    kometUrl: '',
    families: ['FQ06L21', 'FQ06L25', 'FQ06L31', 'FQ04L21', 'FQ04L25', 'FQ04L31', 'GPFQ06', 'GPFQ04'],
    label:    'MTB524 strip 07 (endo): FQ06/FQ04 FlexxFile Q with glide path packs',
  },
  {
    path:     `${MTB524}-08.jpg`,
    kometUrl: '',
    families: ['OP08L19', 'OP10L15', 'OP10L19', 'OPR08L19', 'OPR10L19', 'RE10L15', 'RE05L21', 'RE05L25'],
    label:    'MTB524 strip 08 (endo): OptiFile OP/OPR rotary files, RE10/RE05 reciprocating files',
  },
  {
    path:     `${MTB524}-09.jpg`,
    kometUrl: '',
    families: ['Procodile', 'PROC6L21', 'PROC5L21', 'PROC4L21', 'PRQ6L21', 'PRQ5L21', 'PRQ4L21', 'GPPR06', 'GPPR05', 'GPPR04'],
    label:    'MTB524 strip 09 (endo): Procodile retreatment files, PRQ Prodicle Q variants',
  },
  {
    path:     `${MTB524}-10.jpg`,
    kometUrl: '',
    families: ['GP02', 'GP04', 'GPR2L21', 'GPR4L21', 'GP801L', 'PP02', 'PP04', 'BCS1', 'RKT', 'RKP', 'EndoRescue'],
    label:    'MTB524 strip 10 (endo): GP04 gutta-percha condenser, GP801L, BCS1 sealer, EndoRescue',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB137 — Frese Carburo Tungsteno Laboratorio HP (shank 104)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB137}-01.jpg`,
    kometUrl: '',
    families: ['H71E', 'H72E', 'H73E', 'H77E', 'H78E', 'H79E', 'H79EA', 'H88E', 'H89E'],
    label:    'MTB137 strip 01 (CT lab HP): H71-H89 E-series CT burs — standard lab HP shapes',
  },
  {
    path:     `${MTB137}-02.jpg`,
    kometUrl: '',
    families: ['H71EF', 'H73EF', 'H77EF', 'H78EF', 'H79EF', 'H88EF', 'H89EF', 'H73EUF'],
    label:    'MTB137 strip 02 (CT lab HP): H7xEF fine finish CT burs for lab HP use',
  },
  {
    path:     `${MTB137}-03.jpg`,
    kometUrl: '',
    families: ['H79GTi', 'H89GTi', 'H129GTI', 'H136GTI', 'H138GTI', 'H139GTI', 'H251GTI'],
    label:    'MTB137 strip 03 (CT lab HP): GTi titanium-nitride coated CT burs for lab HP',
  },
  {
    path:     `${MTB137}-04.jpg`,
    kometUrl: '',
    families: ['H129E', 'H137E', 'H138E', 'H139E', 'H250E', 'H251E', 'H251EA', 'H257RE', 'H261E'],
    label:    'MTB137 strip 04 (CT lab HP): H12x-H261 long E-series CT burs for deep access HP',
  },
  {
    path:     `${MTB137}-05.jpg`,
    kometUrl: '',
    families: ['H219', 'H219A', 'H219B', 'H72SGFA', 'H79SGFA', 'H251SGFA', 'H79SGEA', 'H251SGEA', 'H251GEA'],
    label:    'MTB137 strip 05 (CT lab HP): H219 lab HP special shapes, SGFA/SGEA lab system burs',
  },
  {
    path:     `${MTB137}-06.jpg`,
    kometUrl: '',
    families: ['H77ACR', 'H79ACR', 'H251ACR', 'H251EQ', 'K79ACR', 'K251ACR', 'K251EQ', 'H30E'],
    label:    'MTB137 strip 06 (CT lab HP): ACR acrylic-specific CT burs, K-series for acrylic HP lab',
  },
  {
    path:     `${MTB137}-07.jpg`,
    kometUrl: '',
    families: ['H73SHAX', 'H77SHAX', 'H79SHAX', 'H89SHAX', 'H129SHAX', 'H138SHAX', 'H139SHAX', 'H250SHAX', 'H251SHAX', 'H261SHAX'],
    label:    'MTB137 strip 07 (CT lab HP): SHAX high-performance CT burs for lab HP',
  },
  {
    path:     `${MTB137}-08.jpg`,
    kometUrl: '',
    families: ['H73NEX', 'H77NEX', 'H79NEX', 'H89NEX', 'H129NEX', 'H138NEX', 'H139NEX', 'H250NEX', 'H251NEX', 'H261NEX', 'NEF', 'H250NEF'],
    label:    'MTB137 strip 08 (CT lab HP): NEXpert super-hard CT burs for lab HP, NEF nano-enhanced',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB161 — Dischi Diamantati Laboratorio
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB161}-01.jpg`,
    kometUrl: '',
    families: ['934', '6934'],
    label:    'MTB161 strip 01 (disc lab): 934/6934 honeycomb flexible diamond disc — double-sided ultra-fine',
  },
  {
    path:     `${MTB161}-02.jpg`,
    kometUrl: '',
    families: ['8934A', '934', '6934'],
    label:    'MTB161 strip 02 (disc lab): 8934A stripping disc for interproximal reduction (IPR)',
  },
  {
    path:     `${MTB161}-03.jpg`,
    kometUrl: '',
    families: ['6924', '924XC'],
    label:    'MTB161 strip 03 (disc lab): 6924 reinforced diamond disc — rigid for hard materials',
  },
  {
    path:     `${MTB161}-04.jpg`,
    kometUrl: '',
    families: ['911', '911H', '911HP'],
    label:    'MTB161 strip 04 (disc lab): 911/911H standard reference diamond separation disc',
  },
  {
    path:     `${MTB161}-05.jpg`,
    kometUrl: '',
    families: ['6911H', '911HK', '6911HK'],
    label:    'MTB161 strip 05 (disc lab): 6911H double-sided, 911HK/6911HK reinforced ceramic disc',
  },
  {
    path:     `${MTB161}-06.jpg`,
    kometUrl: '',
    families: ['911HF', '6911HF', '911HEF'],
    label:    'MTB161 strip 06 (disc lab): 911HF/6911HF high-performance fine disc for ceramics',
  },
  {
    path:     `${MTB161}-07.jpg`,
    kometUrl: '',
    families: ['911HV', '911HH', '911HP'],
    label:    'MTB161 strip 07 (disc lab): 911HV/HH single-sided coated disc variants',
  },
  {
    path:     `${MTB161}-08.jpg`,
    kometUrl: '',
    families: ['936'],
    label:    'MTB161 strip 08 (disc lab): 936 diamond disc with segmented edge for rough contouring',
  },
  {
    path:     `${MTB161}-09.jpg`,
    kometUrl: '',
    families: ['9527', '9512', '9501', '946'],
    label:    'MTB161 strip 09 (disc lab): 9527/9512/9501 polishing discs for lab finishing',
  },
  {
    path:     `${MTB161}-10.jpg`,
    kometUrl: '',
    families: ['9637', '9452C', '9452M', '9452F', '987P', '8964'],
    label:    'MTB161 strip 10 (disc lab): 9637/9452 finishing discs, 987P/8964 special lab abrasives',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB456 — Fresoni Laboratorio HP (shank 104)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB456}-01.jpg`,
    kometUrl: '',
    families: ['H364E', 'H364F', 'H364RE', 'H364RF', 'H364RA'],
    label:    'MTB456 strip 01 (fresoni lab HP): H364 large multilame bur — E/F finishing variants',
  },
  {
    path:     `${MTB456}-02.jpg`,
    kometUrl: '',
    families: ['H364RXE', 'H364RGE', 'H364RNF', 'H364R', 'H364KRXE', 'H364KRS'],
    label:    'MTB456 strip 02 (fresoni lab HP): H364R XE/GE/NF precision finishing, H364KR',
  },
  {
    path:     `${MTB456}-03.jpg`,
    kometUrl: '',
    families: ['H356E', 'H356F', 'H356RSE', 'H356RF', 'H356RXE', 'H356RGE', 'H356RS', 'H356RA'],
    label:    'MTB456 strip 03 (fresoni lab HP): H356 smaller multilame — E/F/RS/RXE finishing',
  },
  {
    path:     `${MTB456}-04.jpg`,
    kometUrl: '',
    families: ['H347RXE', 'H347RS', 'H207R', 'H97', 'H97A', 'H97B', 'H97BZ'],
    label:    'MTB456 strip 04 (fresoni lab HP): H347 fine finishing, H207R/H97 special lab shapes',
  },
  {
    path:     `${MTB456}-05.jpg`,
    kometUrl: '',
    families: ['H79EL', 'H251EL', 'H261EL', 'H295EL', 'H79EFL', 'H73UML', 'H77UML', 'H139UML'],
    label:    'MTB456 strip 05 (fresoni lab HP): EL/UML extra-long CT burs for deep access lab HP',
  },
  {
    path:     `${MTB456}-06-corretto.jpg`,
    kometUrl: '',
    families: ['H79SGEL', 'H79SGFA', 'H251SGFA', 'H79SGEA', 'H251SGEA', 'H251GEA'],
    label:    'MTB456 strip 06 (fresoni lab HP): SGFA/SGEA/SGEL high-performance system burs',
  },
  {
    path:     `${MTB456}-07.jpg`,
    kometUrl: '',
    families: ['H21XL', 'H33XLQ', 'H1L', 'H23RSEL', 'H549', 'H21L'],
    label:    'MTB456 strip 07 (fresoni lab HP): XL/XLQ extra-large CT burs for major lab work',
  },
  {
    path:     `${MTB456}-08.jpg`,
    kometUrl: '',
    families: ['K79GSQ', 'K251GSQ', 'K261GSQ', 'GSQ', 'H77GSQ', 'H79GSQ', 'H251GSQ', 'H261GSQ', 'H351GSQ'],
    label:    'MTB456 strip 08 (fresoni lab HP): GSQ/K-GSQ gypsum/stone grinding burs for lab HP',
  },
  {
    path:     `${MTB456}-09.jpg`,
    kometUrl: '',
    families: ['H73FSQ', 'H77FSQ', 'H79FSQ', 'H129FSQ', 'H138FSQ', 'H139FSQ', 'H251FSQ', 'H261FSQ', 'H351FSQ'],
    label:    'MTB456 strip 09 (fresoni lab HP): FSQ finishing system burs for lab HP',
  },
  {
    path:     `${MTB456}-10.jpg`,
    kometUrl: '',
    families: ['ZR6801', 'TD2041', '75', '79', 'H1L', 'H30', '561', '8830', 'PolyBur', '9612', '9622'],
    label:    'MTB456 strip 10 (fresoni lab HP): ZR/TD special shapes, misc large lab burs',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB335 — Fresaggio Laboratorio (milling instruments)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB335}-01.jpg`,
    kometUrl: '',
    families: ['K79ACR', 'K251ACR', 'K251EQ', 'H77ACR', 'H79ACR', 'H251ACR', 'H251EQ'],
    label:    'MTB335 strip 01 (milling lab): K/H ACR acrylic milling burs for PMMA prosthetics',
  },
  {
    path:     `${MTB335}-02.jpg`,
    kometUrl: '',
    families: ['K79GSQ', 'K251GSQ', 'K261GSQ', 'H77GSQ', 'H79GSQ', 'H136GSQ', 'H251GSQ', 'H261GSQ'],
    label:    'MTB335 strip 02 (milling lab): K/H GSQ gypsum/stone milling burs for models',
  },
  {
    path:     `${MTB335}-03.jpg`,
    kometUrl: '',
    families: ['H72SGFA', 'H79SGFA', 'H251SGFA', 'H79SGEA', 'H251SGEA', 'H251GEA'],
    label:    'MTB335 strip 03 (milling lab): SGFA/SGEA high-efficiency milling system',
  },
  {
    path:     `${MTB335}-04.jpg`,
    kometUrl: '',
    families: ['H73SHAX', 'H79SHAX', 'H251SHAX', 'H261SHAX', 'H73NEX', 'H79NEX', 'H251NEX'],
    label:    'MTB335 strip 04 (milling lab): SHAX/NEXpert super-hard milling burs',
  },
  {
    path:     `${MTB335}-05.jpg`,
    kometUrl: '',
    families: ['H30E', 'H71E', 'H79E', 'H251E', 'H261E', 'H295E', 'H351E'],
    label:    'MTB335 strip 05 (milling lab): E-series standard milling burs for lab work',
  },
  {
    path:     `${MTB335}-06.jpg`,
    kometUrl: '',
    families: ['H73UM', 'H77UM', 'H79UM', 'H89UM', 'H251UM', 'H261UM', 'H351UM', 'H257RUM'],
    label:    'MTB335 strip 06 (milling lab): UM ultra-mini milling burs for fine detail',
  },
  {
    path:     `${MTB335}-07-corretto-gen2024.jpg`,
    kometUrl: '',
    families: ['H77DF', 'H79DF', 'H251DF', 'H261DF', 'H295DF', 'H129DF', 'H138DF', 'H139DF'],
    label:    'MTB335 strip 07 (milling lab): DF diamond-finish milling burs for composite/ceramic',
  },
  {
    path:     `${MTB335}-08.jpg`,
    kometUrl: '',
    families: ['H73FSQ', 'H79FSQ', 'H251FSQ', 'H73UK', 'H77UK', 'H79UK', 'H139UK'],
    label:    'MTB335 strip 08 (milling lab): FSQ finishing system, UK universal key milling burs',
  },
  {
    path:     `${MTB335}-09.jpg`,
    kometUrl: '',
    families: ['9612', '9622', '561', '8830', 'PolyBur', 'H98', 'H219', 'H219A', 'H219B'],
    label:    'MTB335 strip 09 (milling lab): misc milling accessories and special HP lab forms',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB372 — Punte Soniche
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB372}-01.jpg`,
    kometUrl: '',
    families: ['SF1', 'SF2', 'SF3', 'SF4', 'SF6', 'SF8'],
    label:    'MTB372 strip 01 (sonic): SF1-SF8 basic sonic tips for conservative prep',
  },
  {
    path:     `${MTB372}-02.jpg`,
    kometUrl: '',
    families: ['SF4L', 'SF4R', 'SF10L', 'SF10R', 'SF10T', 'SF11', 'SF12'],
    label:    'MTB372 strip 02 (sonic): SF4L/4R interproximal, SF10/SF11/SF12 access tips',
  },
  {
    path:     `${MTB372}-03.jpg`,
    kometUrl: '',
    families: ['SF16', 'SF17', 'SF20', 'SF21', 'SF55', 'SF56', 'SF57'],
    label:    'MTB372 strip 03 (sonic): SF16-SF57 prep and access sonic tips',
  },
  {
    path:     `${MTB372}-04.jpg`,
    kometUrl: '',
    families: ['SF30M', 'SF30D', 'SF58M', 'SF58D', 'SF65', 'SF66', 'SF67', 'SF68', 'SF69', 'SF70'],
    label:    'MTB372 strip 04 (sonic): SF30M/D mesial-distal, SF58 long shapes, SF65-70 special',
  },
  {
    path:     `${MTB372}-05.jpg`,
    kometUrl: '',
    families: ['SFD1F', 'SFM1F', 'SFD2F', 'SFM2F', 'SFD3F', 'SFM3F', 'SFD6', 'SFD7', 'SFM6', 'SFM7'],
    label:    'MTB372 strip 05 (sonic): SFD/SFM diamond-coated sonic tips for ceramic prep',
  },
  {
    path:     `${MTB372}-06-corretto-gen2024.jpg`,
    kometUrl: '',
    families: ['SF849', 'SF856', 'SF862', 'SF847KR', 'SF879', 'SF8979', 'SF878K', 'SF8878K', 'SF8850', 'SF8868L', 'SF8868R'],
    label:    'MTB372 strip 06 (sonic): SF849/856/862/879 shape-specific sonic tips — flame, torpedo, cylinder',
  },
  {
    path:     `${MTB372}-07.jpg`,
    kometUrl: '',
    families: ['SFS99', 'SFS100', 'SFS101', 'SFS102', 'SFS103', 'SFS104', 'SFS105', 'SFS109', 'SFS110'],
    label:    'MTB372 strip 07 (sonic): SFS99-110 SonicLine sonic tips for posterior prep',
  },
  {
    path:     `${MTB372}-08.jpg`,
    kometUrl: '',
    families: ['SFS120', 'SFS121', 'SFS122', 'SFQ1', 'SFQ3', 'SFQ8', 'SFQM7', 'SFQD7', 'SF1982', 'SF1981'],
    label:    'MTB372 strip 08 (sonic): SFS120-122 long SonicLine, SFQ Quick-change sonic tips',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB450 — Punte Ultrasoniche (Piezoline)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB450}-01.jpg`,
    kometUrl: '',
    families: ['SFS99', 'SFS100', 'SFS101', 'SFS102', 'SFSQ100', 'SFSQ101', 'SFSQ102'],
    label:    'MTB450 strip 01 (ultrasonic): SFS99-102 / SFSQ100-102 Piezoline ultrasonic tips basic',
  },
  {
    path:     `${MTB450}-02.jpg`,
    kometUrl: '',
    families: ['SFS103', 'SFS104', 'SFS105', 'SFS109', 'SFS110', 'SFSQ120', 'SFSQ121', 'SFSQ122'],
    label:    'MTB450 strip 02 (ultrasonic): SFS103-110 prep tips, SFSQ120-122 long Piezoline',
  },
  {
    path:     `${MTB450}-03.jpg`,
    kometUrl: '',
    families: ['SFS120', 'SFS121', 'SFS122'],
    label:    'MTB450 strip 03 (ultrasonic): SFS120-122 long-access Piezoline ultrasonic tips',
  },
  {
    path:     `${MTB450}-04.jpg`,
    kometUrl: '',
    families: ['OS', 'OS1M', 'OS1F', 'OS2M', 'OS2F', 'OS1MH', 'OS1MV', 'OS1FH', 'OS1FV'],
    label:    'MTB450 strip 04 (ultrasonic): OttoShape OS1M/F/H/V basic shapes for periodontal ultrasonic',
  },
  {
    path:     `${MTB450}-05.jpg`,
    kometUrl: '',
    families: ['OS15FH', 'OS15FV', 'OS18MH', 'OS18MV', 'OS18MHE', 'OS18MVE', 'OS20FH', 'OS20FV', 'OS20F'],
    label:    'MTB450 strip 05 (ultrasonic): OS15/OS18/OS20 OttoShape H/V access ultrasonic',
  },
  {
    path:     `${MTB450}-06.jpg`,
    kometUrl: '',
    families: ['OS25M', 'OS35M', 'OS20FV'],
    label:    'MTB450 strip 06 (ultrasonic): OS25M/OS35M large OttoShape perio ultrasonic tips',
  },
  {
    path:     `${MTB450}-07.jpg`,
    kometUrl: '',
    families: ['SFQ4L', 'SFQ4R', 'SFQ10L', 'SFQ10R', 'SFQ10T', 'SFQ11', 'SFQD1F', 'SFQM1F', 'SFC0979', 'SFC0B62'],
    label:    'MTB450 strip 07 (ultrasonic): SFQ Quick-change tips, SFC special ultrasonic forms',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB159 — Gommini Studio (rubber polishers for studio use)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB159}-01-corretto-gen2024.jpg`,
    kometUrl: '',
    families: ['94000C', '94000M', '94000F', '94020C', '94020F', '94021C', '94021F', '94022C', '94022F'],
    label:    'MTB159 strip 01 (gommini studio): 94000/94020/94021/94022 Art2 rubber polishers — flame, bullet, cup',
  },
  {
    path:     `${MTB159}-02.jpg`,
    kometUrl: '',
    families: ['94004C', '94004M', '94004F', '94005C', '94005M', '94005F', '94006C', '94006F', '94010C', '94010M', '94010F'],
    label:    'MTB159 strip 02 (gommini studio): 94004-94010 cylindrical/bullet rubber polishers',
  },
  {
    path:     `${MTB159}-03.jpg`,
    kometUrl: '',
    families: ['9545C', '9545M', '9545F', '9545F', 'CER1', 'CER2', '94011C', '94011F'],
    label:    'MTB159 strip 03 (gommini studio): 9545 cup polisher, CER1/CER2 ceramic polishing set',
  },
  {
    path:     `${MTB159}-04.jpg`,
    kometUrl: '',
    families: ['94012C', '94012F', '94013C', '94013F', '94018C', '94018F', '94019C', '94019F', '94027C', '94027F'],
    label:    'MTB159 strip 04 (gommini studio): 94012-94027 ceramic rubber polishers — disc, bullet, cup',
  },
  {
    path:     `${MTB159}-05-corretto-gen2024.jpg`,
    kometUrl: '',
    families: ['286', '287', '288', '289', '290', '292', '293', '294', '295', '296'],
    label:    'MTB159 strip 05 (gommini studio): 286-296 composite polishers — 3-step system',
  },
  {
    path:     `${MTB159}-06.jpg`,
    kometUrl: '',
    families: ['298', '299', '300', '301', '302', '303', '304', '94001C', '94001M', '94001F'],
    label:    'MTB159 strip 06 (gommini studio): 298-304 ceramic polishers — 2/3-step',
  },
  {
    path:     `${MTB159}-07.jpg`,
    kometUrl: '',
    families: ['305', '306', '307', '308', '309', '310', '311', '312', '314'],
    label:    'MTB159 strip 07 (gommini studio): 305-314 amalgam/metal polishers',
  },
  {
    path:     `${MTB159}-08.jpg`,
    kometUrl: '',
    families: ['9523UF', '9524UF', '9525UF', '9526UF', '94028M', '94028F', '94023M', '94023F', '9687', '9688', '9689'],
    label:    'MTB159 strip 08 (gommini studio): ultra-fine composite polishers, 9687-9689 finesse series',
  },

  // ══════════════════════════════════════════════════════════════════════════════
  // MTB325 — Gommini Laboratorio (rubber polishers for lab use)
  // ══════════════════════════════════════════════════════════════════════════════

  {
    path:     `${MTB325}-01.jpg`,
    kometUrl: '',
    families: ['9606', '9616', '9607', '9617'],
    label:    'MTB325 strip 01 (gommini lab): 9606/9607 amalgam polisher pointed/cup for lab',
  },
  {
    path:     `${MTB325}-02.jpg`,
    kometUrl: '',
    families: ['9608', '9618', '9609', '9619', '9610', '9620'],
    label:    'MTB325 strip 02 (gommini lab): 9608-9610/9618-9620 pointed and bullet polishers',
  },
  {
    path:     `${MTB325}-03.jpg`,
    kometUrl: '',
    families: ['9611', '9621', '9615', '9625', '9646', '9634'],
    label:    'MTB325 strip 03 (gommini lab): 9611/9615/9646 mushroom and cylindrical lab polishers',
  },
  {
    path:     `${MTB325}-04.jpg`,
    kometUrl: '',
    families: ['9648', '9649', '9635', '9636', '9522C', '9522M', '9522F'],
    label:    'MTB325 strip 04 (gommini lab): 9648/9649 stick polisher, 9635/9636 cylindrical, 9522 unmounted',
  },
  {
    path:     `${MTB325}-05.jpg`,
    kometUrl: '',
    families: ['9675', '9584', '9678', '9574', '9575', '9572', '9661'],
    label:    'MTB325 strip 05 (gommini lab): 9675 large disc, 9584 flame, 9574-9575 lens shapes',
  },
  {
    path:     `${MTB325}-06.jpg`,
    kometUrl: '',
    families: ['9701M', '9701F', '9702M', '9702F', '9703M', '9703F', '9704M', '9704F'],
    label:    'MTB325 strip 06 (gommini lab): 9701-9704 M/F disc and cylinder polishers series 2',
  },
  {
    path:     `${MTB325}-07.jpg`,
    kometUrl: '',
    families: ['9550', '9551', '9552'],
    label:    'MTB325 strip 07 (gommini lab): 9550-9552 flat disc and cylinder lab polishers',
  },
  {
    path:     `${MTB325}-08.jpg`,
    kometUrl: '',
    families: ['9555', '9556', '9557', '9553'],
    label:    'MTB325 strip 08 (gommini lab): 9553-9557 cone, cylinder, lentil polishers',
  },
  {
    path:     `${MTB325}-09.jpg`,
    kometUrl: '',
    families: ['9400', '9401', '9402', '9403', '9404', '9405', '9406', '9407', '9408'],
    label:    'MTB325 strip 09 (gommini lab): 9400-9408 composite polisher set — all shapes',
  },
  {
    path:     `${MTB325}-10.jpg`,
    kometUrl: '',
    families: ['9436C', '9436M', '9436F', '9432', '9424', '9433'],
    label:    'MTB325 strip 10 (gommini lab): 9436 C/M/F composite, 9432/9424/9433 lab shapes',
  },
  {
    path:     `${MTB325}-11-corretto-gen2024.jpg`,
    kometUrl: '',
    families: ['9515M', '9515F', '9631', '9630', '9627', '9628', '9629'],
    label:    'MTB325 strip 11 (gommini lab): 9515/9631 composite polishing, 9630/9627 finishing',
  },
  {
    path:     `${MTB325}-12.jpg`,
    kometUrl: '',
    families: ['9684', '9685', '9686', '9687', '9688', '9689', '9696'],
    label:    'MTB325 strip 12 (gommini lab): 9684-9689 finesse polishing series, 9696 special',
  },
  {
    path:     `${MTB325}-13.jpg`,
    kometUrl: '',
    families: ['601', '638', '645', '649', '661', '326', '9300', '9301'],
    label:    'MTB325 strip 13 (gommini lab): 601-661 polishing series, 9300/9301 ceramic polishers',
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
