import { getDeviceId } from "../utils/device-id";

export class PendingRealtimeService {
  private static instance: PendingRealtimeService;
  private deviceId: string;
  private recentIdempotencyKeys: Set<string> = new Set();

  private constructor() {
    this.deviceId = getDeviceId();
  }

  public static getInstance(): PendingRealtimeService {
    if (!PendingRealtimeService.instance) {
      PendingRealtimeService.instance = new PendingRealtimeService();
    }
    return PendingRealtimeService.instance;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public trackIdempotencyKey(key: string): void {
    this.recentIdempotencyKeys.add(key);
    setTimeout(() => {
      this.recentIdempotencyKeys.delete(key);
    }, 60_000);
  }

  public hasIdempotencyKey(key: string): boolean {
    return this.recentIdempotencyKeys.has(key);
  }
}
