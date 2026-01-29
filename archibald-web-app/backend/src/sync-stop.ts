export class SyncStopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncStopError";
  }
}

export const isSyncStopError = (error: unknown): error is SyncStopError =>
  error instanceof SyncStopError;
