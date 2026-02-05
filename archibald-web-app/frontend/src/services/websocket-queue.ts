/**
 * Offline queue service for WebSocket operations
 * Provides localStorage persistence for queued operations during disconnect
 */

const STORAGE_KEY = "wsOfflineQueue";
const MAX_QUEUE_SIZE = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface QueueItem {
  id: string;
  type: string;
  payload: unknown;
  timestamp: string;
}

class WebSocketQueue {
  private queue: QueueItem[] = [];

  constructor() {
    this.loadFromStorage();
    this.cleanup();
  }

  /**
   * Add item to queue
   */
  enqueue(type: string, payload: unknown): void {
    const item: QueueItem = {
      id: crypto.randomUUID(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    this.queue.push(item);

    // Enforce max size
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }

    this.saveToStorage();
  }

  /**
   * Get and remove next item from queue
   */
  dequeue(): QueueItem | null {
    if (this.queue.length === 0) {
      return null;
    }

    const item = this.queue.shift()!;
    this.saveToStorage();
    return item;
  }

  /**
   * Get all items and clear queue
   */
  dequeueAll(): QueueItem[] {
    const items = [...this.queue];
    this.queue = [];
    this.saveToStorage();
    return items;
  }

  /**
   * Clear all items from queue
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Get all items (read-only)
   */
  getAll(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as QueueItem[];
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      }
    } catch (error) {
      console.error("Failed to load WebSocket queue from localStorage:", error);
      this.queue = [];
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed to save WebSocket queue to localStorage:", error);
    }
  }

  /**
   * Remove items older than 24 hours
   */
  private cleanup(): void {
    const now = Date.now();
    const initialSize = this.queue.length;

    this.queue = this.queue.filter((item) => {
      const age = now - new Date(item.timestamp).getTime();
      return age < MAX_AGE_MS;
    });

    if (this.queue.length < initialSize) {
      this.saveToStorage();
      console.log(
        `[WebSocketQueue] Cleaned up ${initialSize - this.queue.length} stale items (>24h old)`,
      );
    }
  }
}

// Export singleton instance
export const websocketQueue = new WebSocketQueue();
