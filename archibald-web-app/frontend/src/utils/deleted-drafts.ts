const DELETED_IDS_KEY = "archibald_deleted_draft_ids";
const QUEUED_DELETES_KEY = "archibald_queued_draft_deletes";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function isDraftDeleted(draftId: string): boolean {
  if (!draftId) return false;
  return readSet(DELETED_IDS_KEY).has(draftId);
}

export function markDraftDeleted(draftId: string): void {
  if (!draftId) return;
  const set = readSet(DELETED_IDS_KEY);
  set.add(draftId);
  writeSet(DELETED_IDS_KEY, set);
}

export function clearDeletedDraftIds(): void {
  localStorage.removeItem(DELETED_IDS_KEY);
}

export function getDeletedDraftIds(): string[] {
  return [...readSet(DELETED_IDS_KEY)];
}

export function queueOfflineDelete(draftId: string): void {
  if (!draftId) return;
  const set = readSet(QUEUED_DELETES_KEY);
  set.add(draftId);
  writeSet(QUEUED_DELETES_KEY, set);
}

export function getQueuedDeletes(): string[] {
  return [...readSet(QUEUED_DELETES_KEY)];
}

export function clearQueuedDeletes(): void {
  localStorage.removeItem(QUEUED_DELETES_KEY);
}
