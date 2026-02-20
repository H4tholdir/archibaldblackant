import * as XLSX from 'xlsx';
import type { SubclientInput } from './db/repositories/subclients';
import { normalizeSubClientCode } from './arca-import-service';

type SubclientParseResult = {
  subclients: SubclientInput[];
  totalRows: number;
  imported: number;
  skipped: number;
  errors: string[];
};

type ColumnMapping = {
  codice: string | undefined;
  ragioneSociale: string | undefined;
  supplRagioneSociale: string | undefined;
  indirizzo: string | undefined;
  cap: string | undefined;
  localita: string | undefined;
  prov: string | undefined;
  telefono: string | undefined;
  fax: string | undefined;
  email: string | undefined;
  partitaIva: string | undefined;
  codFiscale: string | undefined;
  zona: string | undefined;
  persDaContattare: string | undefined;
  emailAmministraz: string | undefined;
};

const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  codice: ['codice'],
  ragioneSociale: ['ragione sociale', 'ragionesociale', 'nome'],
  supplRagioneSociale: ['suppl ragione sociale', 'supplragionesociale', 'suppl. ragione sociale'],
  indirizzo: ['indirizzo'],
  cap: ['cap'],
  localita: ['localita', 'località', 'citta', 'città'],
  prov: ['prov', 'provincia'],
  telefono: ['telefono', 'tel'],
  fax: ['fax'],
  email: ['email', 'e-mail'],
  partitaIva: ['partita iva', 'partitaiva', 'p.iva', 'piva'],
  codFiscale: ['cod fiscale', 'codfiscale', 'codice fiscale'],
  zona: ['zona'],
  persDaContattare: ['pers da contattare', 'persdacontattare', 'persona da contattare', 'contatto'],
  emailAmministraz: ['email amministraz', 'emailamministraz', 'email amministrazione'],
};

function resolveColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase());

  const mapping: ColumnMapping = {
    codice: undefined, ragioneSociale: undefined, supplRagioneSociale: undefined,
    indirizzo: undefined, cap: undefined, localita: undefined, prov: undefined,
    telefono: undefined, fax: undefined, email: undefined,
    partitaIva: undefined, codFiscale: undefined, zona: undefined,
    persDaContattare: undefined, emailAmministraz: undefined,
  };

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<[keyof ColumnMapping, string[]]>) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx !== -1) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

function trimOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function parseSubclientsExcel(buffer: Buffer): SubclientParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { subclients: [], totalRows: 0, imported: 0, skipped: 0, errors: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

  if (data.length === 0) {
    return { subclients: [], totalRows: 0, imported: 0, skipped: 0, errors: [] };
  }

  const headers = Object.keys(data[0]);
  const mapping = resolveColumnMapping(headers);

  const subclients: SubclientInput[] = [];
  const errors: string[] = [];
  let skipped = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2;

    const rawCodice = mapping.codice ? trimOrNull(row[mapping.codice]) : null;
    if (!rawCodice) {
      errors.push(`Row ${rowNum}: missing required field "codice"`);
      skipped++;
      continue;
    }

    const ragioneSociale = mapping.ragioneSociale ? trimOrNull(row[mapping.ragioneSociale]) : null;
    if (!ragioneSociale) {
      errors.push(`Row ${rowNum}: missing required field "ragione_sociale"`);
      skipped++;
      continue;
    }

    const codice = normalizeSubClientCode(rawCodice);

    subclients.push({
      codice,
      ragioneSociale,
      supplRagioneSociale: mapping.supplRagioneSociale ? trimOrNull(row[mapping.supplRagioneSociale]) : null,
      indirizzo: mapping.indirizzo ? trimOrNull(row[mapping.indirizzo]) : null,
      cap: mapping.cap ? trimOrNull(row[mapping.cap]) : null,
      localita: mapping.localita ? trimOrNull(row[mapping.localita]) : null,
      prov: mapping.prov ? trimOrNull(row[mapping.prov]) : null,
      telefono: mapping.telefono ? trimOrNull(row[mapping.telefono]) : null,
      fax: mapping.fax ? trimOrNull(row[mapping.fax]) : null,
      email: mapping.email ? trimOrNull(row[mapping.email]) : null,
      partitaIva: mapping.partitaIva ? trimOrNull(row[mapping.partitaIva]) : null,
      codFiscale: mapping.codFiscale ? trimOrNull(row[mapping.codFiscale]) : null,
      zona: mapping.zona ? trimOrNull(row[mapping.zona]) : null,
      persDaContattare: mapping.persDaContattare ? trimOrNull(row[mapping.persDaContattare]) : null,
      emailAmministraz: mapping.emailAmministraz ? trimOrNull(row[mapping.emailAmministraz]) : null,
    });
  }

  return {
    subclients,
    totalRows: data.length,
    imported: subclients.length,
    skipped,
    errors,
  };
}

export { parseSubclientsExcel, type SubclientParseResult };
