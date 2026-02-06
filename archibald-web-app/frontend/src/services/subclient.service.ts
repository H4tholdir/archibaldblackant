import { db } from "../db/schema";
import type { SubClient } from "../db/schema";

class SubClientService {
  private static instance: SubClientService;

  static getInstance(): SubClientService {
    if (!SubClientService.instance) {
      SubClientService.instance = new SubClientService();
    }
    return SubClientService.instance;
  }

  async syncSubClients(): Promise<number> {
    const jwt = localStorage.getItem("archibald_jwt");
    if (!jwt) throw new Error("Not authenticated");

    const response = await fetch("/api/subclients", {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subclients: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to fetch subclients");
    }

    const subClients: SubClient[] = data.data;

    await db.transaction("rw", db.subClients, async () => {
      await db.subClients.bulkPut(subClients);

      const remoteCodici = new Set(subClients.map((sc) => sc.codice));
      const localKeys = await db.subClients.toCollection().primaryKeys();
      const toDelete = localKeys.filter((k) => !remoteCodici.has(k as string));
      if (toDelete.length > 0) {
        await db.subClients.bulkDelete(toDelete);
      }
    });

    return subClients.length;
  }

  async searchSubClients(query: string): Promise<SubClient[]> {
    if (!query || query.length === 0) return [];

    const lowerQuery = query.toLowerCase();

    return db.subClients
      .filter(
        (sc) =>
          sc.codice.toLowerCase().includes(lowerQuery) ||
          sc.ragioneSociale.toLowerCase().includes(lowerQuery) ||
          (sc.supplRagioneSociale?.toLowerCase().includes(lowerQuery) ?? false),
      )
      .limit(30)
      .toArray();
  }

  async getSubClientByCodice(codice: string): Promise<SubClient | undefined> {
    return db.subClients.get(codice);
  }

  async getSubClientCount(): Promise<number> {
    return db.subClients.count();
  }
}

export const subClientService = SubClientService.getInstance();
