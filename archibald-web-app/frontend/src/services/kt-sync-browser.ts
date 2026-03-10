import { fetchWithRetry } from '../utils/fetch-with-retry';

type KtSyncProgress = {
  stage: 'calling-api' | 'writing-vbs' | 'done' | 'error';
  message?: string;
};

type VbsResult = {
  vbs: string;
  bat: string;
  watcher: string;
  watcherSetup: string;
};

type KtSyncApiResponse = {
  success: boolean;
  synced: number;
  errors: string[];
  vbsScript: VbsResult | null;
};

type KtSyncResult = {
  synced: number;
  errors: string[];
  vbsWritten: boolean;
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

function loadHandle(db: IDBDatabase): Promise<FileSystemDirectoryHandle | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(IDB_KEY);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
}

function saveHandle(db: IDBDatabase, handle: FileSystemDirectoryHandle): Promise<void> {
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

async function performKtSync(
  orderIds: string[],
  matchOverrides: Record<string, string>,
  onProgress: (p: KtSyncProgress) => void,
): Promise<KtSyncResult> {
  onProgress({ stage: 'calling-api', message: 'Generazione documenti KT...' });

  const response = await fetchWithRetry('/api/kt-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderIds, matchOverrides }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const data: KtSyncApiResponse = await response.json();

  if (!data.success) {
    throw new Error(data.errors.join(', ') || 'Sync KT fallito');
  }

  let vbsWritten = false;
  if (data.vbsScript && data.vbsScript.vbs) {
    onProgress({ stage: 'writing-vbs', message: 'Scrittura file VBS nella cartella COOP16...' });
    try {
      const dirHandle = await getDirectoryHandle();
      await writeFile(dirHandle, 'sync_arca.vbs', data.vbsScript.vbs);
      await writeFile(dirHandle, 'sync_arca.bat', data.vbsScript.bat);
      await writeFile(dirHandle, 'arca_watcher.vbs', data.vbsScript.watcher);
      await writeFile(dirHandle, 'setup_watcher.bat', data.vbsScript.watcherSetup);
      vbsWritten = true;
    } catch (err) {
      data.errors.push(`Errore scrittura VBS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  onProgress({ stage: 'done', message: `${data.synced} ordini KT sincronizzati` });

  return {
    synced: data.synced,
    errors: data.errors,
    vbsWritten,
  };
}

export {
  performKtSync,
  type KtSyncProgress,
  type KtSyncResult,
};
