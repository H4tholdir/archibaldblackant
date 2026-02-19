import type { Customer } from "../types/local-customer";
import type { CacheMetadata } from "../types/cache";
import { fetchWithRetry } from "../utils/fetch-with-retry";
import { enqueueOperation } from "../api/operations";

function parseLastOrderDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  return raw;
}

function mapBackendCustomer(c: any): Customer {
  return {
    id: c.customerProfile || c.internalId || c.id || "",
    name: c.name || "",
    code: c.customerProfile || c.code || "",
    taxCode: c.fiscalCode || c.vatNumber || c.taxCode || "",
    address: c.street || c.logisticsAddress || c.address || "",
    city: c.city || "",
    province: c.province || "",
    cap: c.postalCode || c.cap || "",
    phone: c.phone || c.mobile || "",
    email: c.pec || c.email || "",
    fax: c.fax || "",
    lastModified: c.lastSync
      ? new Date(c.lastSync * 1000).toISOString()
      : c.lastModified || new Date().toISOString(),
    lastOrderDate: parseLastOrderDate(c.lastOrderDate),
    hash: c.hash || "",
  };
}

export class CustomerService {
  async searchCustomers(
    query: string,
    limit: number = 50,
  ): Promise<Customer[]> {
    try {
      const params = new URLSearchParams();
      if (query && query.trim().length > 0) {
        params.append("search", query);
      }
      params.append("limit", String(limit));

      const response = await fetchWithRetry(
        `/api/customers?${params}`,
      );
      if (!response.ok) throw new Error("API fetch failed");

      const data = await response.json();
      return (data.data?.customers || []).map(mapBackendCustomer);
    } catch (error) {
      console.error("[CustomerService] searchCustomers failed:", error);
      return [];
    }
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const response = await fetchWithRetry(
        `/api/customers?search=${encodeURIComponent(id)}&limit=1`,
      );
      if (!response.ok) return null;

      const data = await response.json();
      const customers = (data.data?.customers || []).map(mapBackendCustomer);
      return customers.find((c: Customer) => c.id === id) ?? null;
    } catch (error) {
      console.error("[CustomerService] Failed to get customer by ID:", error);
      return null;
    }
  }

  async syncCustomers(): Promise<void> {
    console.log("[CustomerService] syncCustomers is a no-op (server is source of truth)");
  }

  async getCacheMetadata(): Promise<CacheMetadata | null> {
    return null;
  }

  async createCustomer(formData: {
    name: string;
    vatNumber?: string;
    pec?: string;
    sdi?: string;
    street?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    deliveryMode?: string;
    paymentTerms?: string;
    deliveryStreet?: string;
    deliveryPostalCode?: string;
    postalCodeCity?: string;
    postalCodeCountry?: string;
    deliveryPostalCodeCity?: string;
    deliveryPostalCodeCountry?: string;
  }): Promise<{ customer: Customer | null; taskId: string | null }> {
    const result = await enqueueOperation('create-customer', formData as Record<string, unknown>);
    return { customer: null, taskId: result.jobId };
  }

  async updateCustomer(
    customerProfile: string,
    formData: {
      name: string;
      vatNumber?: string;
      pec?: string;
      sdi?: string;
      street?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      deliveryMode?: string;
      paymentTerms?: string;
      deliveryStreet?: string;
      deliveryPostalCode?: string;
      postalCodeCity?: string;
      postalCodeCountry?: string;
      deliveryPostalCodeCity?: string;
      deliveryPostalCodeCountry?: string;
    },
  ): Promise<{ taskId: string | null }> {
    const result = await enqueueOperation('update-customer', {
      customerProfile,
      ...formData,
    } as Record<string, unknown>);
    return { taskId: result.jobId };
  }

  async getCustomerBotStatus(customerProfile: string): Promise<string> {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/status`,
    );

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.botStatus || "placed";
  }

  async retryBotPlacement(customerProfile: string): Promise<void> {
    const response = await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/retry`,
      { method: "POST" },
    );

    if (!response.ok) {
      throw new Error(`Retry failed: ${response.status}`);
    }
  }

  async startInteractiveSession(): Promise<{ sessionId: string }> {
    const response = await fetchWithRetry("/api/customers/interactive/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Start session failed: ${response.status}`);
    }

    const data = await response.json();
    return { sessionId: data.data?.sessionId || "" };
  }

  async submitVatNumber(sessionId: string, vatNumber: string): Promise<void> {
    const response = await fetchWithRetry(
      `/api/customers/interactive/${encodeURIComponent(sessionId)}/vat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vatNumber }),
      },
    );

    if (!response.ok) {
      throw new Error(`VAT submit failed: ${response.status}`);
    }
  }

  async saveInteractiveCustomer(
    sessionId: string,
    formData: {
      name: string;
      vatNumber?: string;
      pec?: string;
      sdi?: string;
      street?: string;
      postalCode?: string;
      phone?: string;
      email?: string;
      deliveryMode?: string;
      paymentTerms?: string;
      deliveryStreet?: string;
      deliveryPostalCode?: string;
      postalCodeCity?: string;
      postalCodeCountry?: string;
      deliveryPostalCodeCity?: string;
      deliveryPostalCodeCountry?: string;
    },
  ): Promise<{ customer: Customer | null; taskId: string | null }> {
    const response = await fetchWithRetry(
      `/api/customers/interactive/${encodeURIComponent(sessionId)}/save`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      },
    );

    if (!response.ok) {
      throw new Error(`Interactive save failed: ${response.status}`);
    }

    const data = await response.json();
    const customer: Customer | undefined = data.data?.customer;
    const taskId: string | undefined = data.data?.taskId;

    return { customer: customer ?? null, taskId: taskId ?? null };
  }

  async heartbeat(sessionId: string): Promise<void> {
    try {
      await fetchWithRetry(
        `/api/customers/interactive/${encodeURIComponent(sessionId)}/heartbeat`,
        { method: "POST" },
      );
    } catch {
      // fire-and-forget
    }
  }

  async cancelInteractiveSession(sessionId: string): Promise<void> {
    const response = await fetchWithRetry(
      `/api/customers/interactive/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      throw new Error(`Cancel session failed: ${response.status}`);
    }
  }

  async uploadPhoto(customerProfile: string, file: File): Promise<void> {
    const compressed = await this.compressImage(file, 800, 0.7);

    const formData = new FormData();
    formData.append("photo", compressed, "photo.jpg");

    await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      { method: "POST", body: formData },
    );
  }

  async deletePhoto(customerProfile: string): Promise<void> {
    await fetchWithRetry(
      `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      { method: "DELETE" },
    );
  }

  async getPhotoUrl(customerProfile: string): Promise<string | null> {
    try {
      const response = await fetchWithRetry(
        `/api/customers/${encodeURIComponent(customerProfile)}/photo`,
      );
      if (!response.ok) return null;

      const blob = await response.blob();
      return await this.blobToDataUri(blob);
    } catch {
      return null;
    }
  }

  private compressImage(
    file: File,
    maxWidth: number,
    quality: number,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Compressione immagine fallita"));
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => reject(new Error("Impossibile caricare l'immagine"));
      img.src = URL.createObjectURL(file);
    });
  }

  private blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Lettura file fallita"));
      reader.readAsDataURL(blob);
    });
  }
}

// Singleton instance
export const customerService = new CustomerService();
