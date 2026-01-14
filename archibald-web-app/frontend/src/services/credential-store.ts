interface StoredCredential {
  userId: string;
  encryptedData: ArrayBuffer;
  iv: Uint8Array;
  salt: Uint8Array;
  createdAt: number;
  lastUsedAt: number;
}

interface DecryptedCredentials {
  username: string;
  password: string;
}

export class CredentialStore {
  private dbName = "ArchibaldCredentials";
  private storeName = "credentials";
  private db: IDBDatabase | null = null;
  private pbkdf2Iterations: number;

  constructor(pbkdf2Iterations: number = 100000) {
    this.pbkdf2Iterations = pbkdf2Iterations;
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "userId" });
        }
      };
    });
  }

  async hasCredentials(userId: string): Promise<boolean> {
    const stored = await this.getStoredCredential(userId);
    return stored !== null;
  }

  async storeCredentials(
    userId: string,
    username: string,
    password: string,
    pin: string,
  ): Promise<void> {
    // 1. Generate random salt (16 bytes)
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // 2. Derive key from PIN using PBKDF2
    const key = await this.deriveKeyFromPin(pin, salt);

    // 3. Generate random IV (12 bytes for AES-GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 4. Encrypt credentials as JSON
    const plaintext = JSON.stringify({ username, password });
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    const encryptedData = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );

    // 5. Store in IndexedDB
    const stored: StoredCredential = {
      userId,
      encryptedData,
      iv,
      salt,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    await this.putStoredCredential(stored);
  }

  async getCredentials(
    userId: string,
    pin: string,
  ): Promise<DecryptedCredentials | null> {
    // 1. Fetch from IndexedDB
    const stored = await this.getStoredCredential(userId);
    if (!stored) return null;

    try {
      // 2. Derive key from PIN with stored salt
      const key = await this.deriveKeyFromPin(pin, stored.salt);

      // 3. Decrypt
      const decryptedData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: stored.iv },
        key,
        stored.encryptedData,
      );

      // 4. Parse JSON
      const decoder = new TextDecoder();
      const plaintext = decoder.decode(decryptedData);
      const credentials: DecryptedCredentials = JSON.parse(plaintext);

      // 5. Update lastUsedAt
      await this.touchCredentials(userId);

      return credentials;
    } catch (error) {
      // Decryption failed (wrong PIN or corrupted data)
      return null;
    }
  }

  async deleteCredentials(userId: string): Promise<void> {
    if (!this.db) throw new Error("CredentialStore not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.delete(userId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async touchCredentials(userId: string): Promise<void> {
    const stored = await this.getStoredCredential(userId);
    if (stored) {
      stored.lastUsedAt = Date.now();
      await this.putStoredCredential(stored);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async deriveKeyFromPin(
    pin: string,
    salt: Uint8Array,
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pinData = encoder.encode(pin);

    // Import PIN as raw key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      pinData,
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    // Derive AES-GCM key using PBKDF2
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: this.pbkdf2Iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false, // not extractable
      ["encrypt", "decrypt"],
    );

    return key;
  }

  private async getStoredCredential(
    userId: string,
  ): Promise<StoredCredential | null> {
    if (!this.db) throw new Error("CredentialStore not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const request = store.get(userId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async putStoredCredential(stored: StoredCredential): Promise<void> {
    if (!this.db) throw new Error("CredentialStore not initialized");

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const request = store.put(stored);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
let instance: CredentialStore | null = null;

export function getCredentialStore(): CredentialStore {
  if (!instance) {
    instance = new CredentialStore();
  }
  return instance;
}
