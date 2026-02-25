import type { DbPool } from '../pool';

type ExcelVatImportRow = {
  id: number;
  filename: string;
  uploaded_by: string;
  uploaded_at: string;
  total_rows: number;
  matched: number;
  unmatched: number;
  vat_updated: number;
  price_updated: number;
  status: string;
};

type ExcelVatImport = {
  id: number;
  filename: string;
  uploadedBy: string;
  uploadedAt: string;
  totalRows: number;
  matched: number;
  unmatched: number;
  vatUpdated: number;
  priceUpdated: number;
  status: string;
};

type RecordImportInput = {
  filename: string;
  uploadedBy: string;
  totalRows: number;
  matched: number;
  unmatched: number;
  vatUpdated: number;
  priceUpdated: number;
  status: string;
};

function toImport(row: ExcelVatImportRow): ExcelVatImport {
  return {
    id: row.id,
    filename: row.filename,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    totalRows: row.total_rows,
    matched: row.matched,
    unmatched: row.unmatched,
    vatUpdated: row.vat_updated,
    priceUpdated: row.price_updated,
    status: row.status,
  };
}

async function recordImport(
  pool: DbPool,
  data: RecordImportInput,
): Promise<ExcelVatImport> {
  const { rows } = await pool.query<ExcelVatImportRow>(
    `INSERT INTO shared.excel_vat_imports (
       filename, uploaded_by, total_rows, matched, unmatched,
       vat_updated, price_updated, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.filename,
      data.uploadedBy,
      data.totalRows,
      data.matched,
      data.unmatched,
      data.vatUpdated,
      data.priceUpdated,
      data.status,
    ],
  );

  return toImport(rows[0]);
}

async function getImportHistory(
  pool: DbPool,
  options?: { limit?: number },
): Promise<ExcelVatImport[]> {
  const limit = options?.limit;

  if (limit !== undefined) {
    const { rows } = await pool.query<ExcelVatImportRow>(
      `SELECT * FROM shared.excel_vat_imports
       ORDER BY uploaded_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(toImport);
  }

  const { rows } = await pool.query<ExcelVatImportRow>(
    `SELECT * FROM shared.excel_vat_imports
     ORDER BY uploaded_at DESC`,
    [],
  );
  return rows.map(toImport);
}

export {
  recordImport,
  getImportHistory,
  type ExcelVatImportRow,
  type ExcelVatImport,
  type RecordImportInput,
};
