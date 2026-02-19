export interface CacheMetadata {
  key: string;
  lastSynced: string;
  recordCount: number;
  version: number;
}

export interface SyncMetadata {
  key: string;
  lastSyncId: number;
}
