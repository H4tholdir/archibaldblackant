export type SyncProgress =
  | { stage: 'requesting-access' }
  | { stage: 'reading-files' }
  | { stage: 'uploading'; filesSize: number }
  | { stage: 'syncing' }
  | { stage: 'done'; result: ArcaSyncResponse };

export type ArcaSyncResponse = {
  success: boolean;
  sync: {
    imported: number;
    skipped: number;
    exported: number;
    ktNeedingMatch?: Array<{ orderId: string; customerName: string }>;
    ktMissingArticles?: string[];
    errors: string[];
  };
  parseStats: {
    totalDocuments: number;
    totalRows: number;
    totalClients: number;
    skippedOtherTypes: number;
  };
  ftExportRecords: Array<{ invoiceNumber: string; arcaData: unknown }>;
};

const IDB_NAME = 'arca-sync-handles';
const IDB_STORE = 'directory-handles';
const IDB_KEY = 'coop16';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadHandle(
  db: IDBDatabase,
): Promise<FileSystemDirectoryHandle | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(IDB_KEY);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
}

function saveHandle(
  db: IDBDatabase,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const request = store.put(handle, IDB_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const db = await openHandleDb();
  try {
    const stored = await loadHandle(db);
    if (stored) {
      const perm = await stored.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return stored;

      const requested = await stored.requestPermission({ mode: 'readwrite' });
      if (requested === 'granted') return stored;
    }

    if (!window.showDirectoryPicker) {
      throw new Error('File System Access API non supportata in questo browser');
    }

    const handle = await window.showDirectoryPicker({
      id: 'arca-coop16',
      mode: 'readwrite',
      startIn: 'desktop',
    });
    await saveHandle(db, handle);
    return handle;
  } finally {
    db.close();
  }
}

type FileToRead = {
  key: string;
  variants: string[];
  optional: boolean;
};

const FILES_TO_READ: FileToRead[] = [
  { key: 'doctes', variants: ['doctes.dbf', 'DOCTES.DBF', 'Doctes.dbf'], optional: false },
  { key: 'docrig', variants: ['docrig.dbf', 'DOCRIG.DBF', 'Docrig.dbf'], optional: false },
  { key: 'anagrafe', variants: ['ANAGRAFE.DBF', 'anagrafe.dbf', 'Anagrafe.DBF'], optional: true },
];

async function tryGetFile(
  dirHandle: FileSystemDirectoryHandle,
  variants: string[],
): Promise<File | null> {
  for (const name of variants) {
    try {
      const fileHandle = await dirHandle.getFileHandle(name);
      return await fileHandle.getFile();
    } catch {
      // try next variant
    }
  }
  return null;
}

async function readDbfFiles(
  dirHandle: FileSystemDirectoryHandle,
): Promise<Map<string, File>> {
  const result = new Map<string, File>();

  for (const spec of FILES_TO_READ) {
    const file = await tryGetFile(dirHandle, spec.variants);
    if (file) {
      result.set(spec.key, file);
    } else if (!spec.optional) {
      throw new Error(
        `File non trovato nella cartella COOP16: ${spec.variants[0]} (provate anche: ${spec.variants.slice(1).join(', ')})`,
      );
    }
  }

  return result;
}

async function uploadFiles(
  files: Map<string, File>,
): Promise<ArcaSyncResponse> {
  const formData = new FormData();
  for (const [key, file] of files) {
    formData.append(key, file, file.name);
  }

  const jwt = localStorage.getItem('archibald_jwt');
  if (!jwt) {
    throw new Error('Sessione scaduta: effettua nuovamente il login');
  }

  const response = await fetch('/api/arca-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Errore upload: ${response.status} - ${text}`);
  }

  return response.json() as Promise<ArcaSyncResponse>;
}


async function writeFile(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeVbsFiles(
  dirHandle: FileSystemDirectoryHandle,
  vbs: KtExportResult['vbsScript'],
): Promise<void> {
  if (!vbs) return;

  await writeFile(dirHandle, 'sync_arca.vbs', vbs.vbs);
  await writeFile(dirHandle, 'sync_arca.bat', vbs.bat);

  await writeFile(dirHandle, 'arca_watcher.vbs', vbs.watcher);
  await writeFile(dirHandle, 'setup_watcher.bat', vbs.watcherSetup);
}

export type KtSyncStatus = {
  total: number;
  articlesReady: number;
  articlesPending: number;
  matched: number;
  unmatched: Array<{ orderId: string; customerName: string; customerProfileId: string | null }>;
  readyToExport: number;
};

export type KtExportResult = {
  ktExported: number;
  vbsScript: {
    vbs: string;
    bat: string;
    watcher: string;
    watcherSetup: string;
  } | null;
};

function authHeaders(): HeadersInit {
  const jwt = localStorage.getItem('archibald_jwt');
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

export async function fetchKtStatus(): Promise<KtSyncStatus> {
  const res = await fetch('/api/arca-sync/kt-status', { headers: authHeaders() });
  if (!res.ok) throw new Error(`kt-status failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function finalizeKtExport(
  ftExportRecords: Array<{ invoiceNumber: string; arcaData: unknown }>,
): Promise<KtExportResult> {
  const res = await fetch('/api/arca-sync/finalize-kt', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ftExportRecords }),
  });
  if (!res.ok) throw new Error(`finalize-kt failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function writeVbsToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  vbs: KtExportResult['vbsScript'],
): Promise<void> {
  await writeVbsFiles(dirHandle, vbs);
}

export async function getOrRequestDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  return getDirectoryHandle();
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

export async function performBrowserArcaSync(
  onProgress: (progress: SyncProgress) => void,
): Promise<ArcaSyncResponse> {
  onProgress({ stage: 'requesting-access' });
  const dirHandle = await getDirectoryHandle();

  onProgress({ stage: 'reading-files' });
  const files = await readDbfFiles(dirHandle);

  let totalSize = 0;
  for (const file of files.values()) {
    totalSize += file.size;
  }
  onProgress({ stage: 'uploading', filesSize: totalSize });

  onProgress({ stage: 'syncing' });
  const result = await uploadFiles(files);

  // NON scrivere VBS qui — il VBS si genera solo in finalizeKtExport
  onProgress({ stage: 'done', result });
  return result;
}
