import * as XLSX from 'xlsx';
import type { Subclient } from '../db/repositories/subclients';

type ImportDeps = {
  upsertSubclients: (subclients: Subclient[]) => Promise<number>;
  getAllCodici: () => Promise<string[]>;
  deleteSubclientsByCodici: (codici: string[]) => Promise<number>;
};

type ImportResult = {
  success: boolean;
  imported?: number;
  skipped?: number;
  error?: string;
};

type HeaderMap = { [canonicalField: string]: string[] };

const HEADER_VARIATIONS: HeaderMap = {
  codice: ['Codice', 'CODICE', 'Cod.', 'COD.', 'codice', 'Cod'],
  ragioneSociale: ['Ragione Sociale', 'RAGIONE SOCIALE', 'Rag. Sociale', 'ragione sociale'],
  supplRagioneSociale: ['Suppl. Rag. Sociale', 'SUPPL. RAG. SOCIALE'],
  indirizzo: ['Indirizzo', 'INDIRIZZO'],
  cap: ['CAP', 'Cap', 'C.A.P.'],
  localita: ['Localita', 'LOCALITA', 'Localit\u00e0'],
  prov: ['Prov', 'PROV', 'Prov.', 'Provincia'],
  telefono: ['Telefono', 'TELEFONO', 'Tel.', 'Tel'],
  fax: ['Fax', 'FAX'],
  email: ['Email', 'EMAIL', 'E-mail', 'e-mail'],
  partitaIva: ['Partita IVA', 'PARTITA IVA', 'P.IVA', 'P. IVA'],
  codFiscale: ['Cod. Fiscale', 'COD. FISCALE', 'Codice Fiscale'],
  zona: ['Zona', 'ZONA'],
  persDaContattare: ['Pers. da contattare', 'PERS. DA CONTATTARE', 'Persona da contattare'],
  emailAmministraz: ['Email Amministraz.', 'EMAIL AMMINISTRAZ.', 'Email Amministrazione'],
};

function buildHeaderLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [canonical, variations] of Object.entries(HEADER_VARIATIONS)) {
    for (const variation of variations) {
      lookup.set(variation.trim().toLowerCase(), canonical);
    }
  }
  return lookup;
}

const HEADER_LOOKUP = buildHeaderLookup();

function normalizeSubClientCode(raw: string | number): string {
  if (raw === null || raw === undefined) return '';

  const str = String(raw).trim();
  if (str === '') return '';

  const stripped = str.replace(/^[Cc](?=\d)/, '');
  if (/^\d+$/.test(stripped)) {
    return stripped.padStart(5, '0');
  }
  return stripped;
}

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function mapHeaders(sheetHeaders: string[]): Map<number, string> {
  const columnMap = new Map<number, string>();
  for (let i = 0; i < sheetHeaders.length; i++) {
    const header = (sheetHeaders[i] ?? '').trim().toLowerCase();
    const canonical = HEADER_LOOKUP.get(header);
    if (canonical) {
      columnMap.set(i, canonical);
    }
  }
  return columnMap;
}

function mapRowToSubclient(
  row: unknown[],
  columnMap: Map<number, string>,
): Subclient | null {
  const fields: Record<string, string | null> = {};
  for (const [colIndex, canonical] of columnMap.entries()) {
    fields[canonical] = cellToString(row[colIndex]);
  }

  const rawCodice = fields['codice'];
  if (!rawCodice) return null;

  const codice = normalizeSubClientCode(rawCodice);
  if (!codice) return null;

  return {
    codice,
    ragioneSociale: fields['ragioneSociale'] ?? '',
    supplRagioneSociale: fields['supplRagioneSociale'] ?? null,
    indirizzo: fields['indirizzo'] ?? null,
    cap: fields['cap'] ?? null,
    localita: fields['localita'] ?? null,
    prov: fields['prov'] ?? null,
    telefono: fields['telefono'] ?? null,
    fax: fields['fax'] ?? null,
    email: fields['email'] ?? null,
    partitaIva: fields['partitaIva'] ?? null,
    codFiscale: fields['codFiscale'] ?? null,
    zona: fields['zona'] ?? null,
    persDaContattare: fields['persDaContattare'] ?? null,
    emailAmministraz: fields['emailAmministraz'] ?? null,
  };
}

async function importSubClients(
  buffer: Buffer,
  _filename: string,
  deps: ImportDeps,
): Promise<ImportResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return {
      success: false,
      error: `Errore lettura file Excel: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, error: 'File Excel senza fogli' };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length < 2) {
    return { success: true, imported: 0, skipped: 0 };
  }

  const headerRow = rawData[0] as string[];
  const columnMap = mapHeaders(headerRow);
  const dataRows = rawData.slice(1);

  const subclients: Subclient[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const subclient = mapRowToSubclient(row as unknown[], columnMap);
    if (subclient) {
      subclients.push(subclient);
    } else {
      skipped++;
    }
  }

  if (subclients.length > 0) {
    await deps.upsertSubclients(subclients);
  }

  const importedCodici = new Set(subclients.map((s) => s.codice));
  const existingCodici = await deps.getAllCodici();
  const toDelete = existingCodici.filter((c) => !importedCodici.has(c));

  if (toDelete.length > 0) {
    await deps.deleteSubclientsByCodici(toDelete);
  }

  return { success: true, imported: subclients.length, skipped };
}

export { normalizeSubClientCode, importSubClients, type ImportDeps, type ImportResult };
