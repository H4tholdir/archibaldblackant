type KometListinoResult = {
  totalRows: number;
  ivaUpdated: number;
  scontiUpdated: number;
  unmatched: number;
  unmatchedProducts: Array<{ excelId: string; excelCodiceArticolo: string; reason: string }>;
  errors: string[];
};

async function importKometListino(file: File): Promise<KometListinoResult> {
  const jwt = localStorage.getItem('archibald_jwt');
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/admin/import-komet-listino', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  const data = await response.json() as { data: KometListinoResult };
  return data.data;
}

export { importKometListino };
export type { KometListinoResult };
