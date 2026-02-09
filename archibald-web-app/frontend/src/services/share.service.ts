import { fetchWithRetry } from "../utils/fetch-with-retry";

function normalizeItalianPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return "+" + cleaned.slice(2);
  if (cleaned.startsWith("3") && cleaned.length >= 9) return "+39" + cleaned;
  return "+39" + cleaned;
}

class ShareService {
  private static instance: ShareService;

  static getInstance(): ShareService {
    if (!ShareService.instance) {
      ShareService.instance = new ShareService();
    }
    return ShareService.instance;
  }

  async uploadPDFForSharing(
    blob: Blob,
    fileName: string,
  ): Promise<{ url: string; id: string }> {
    const formData = new FormData();
    formData.append("file", blob, fileName);

    const response = await fetchWithRetry("/api/share/upload-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Errore durante il caricamento del PDF");
    }

    return response.json();
  }

  async sendEmail(
    blob: Blob,
    fileName: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<{ messageId: string }> {
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("to", to);
    formData.append("subject", subject);
    formData.append("body", body);

    const response = await fetchWithRetry("/api/share/email", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Errore durante l'invio dell'email");
    }

    return response.json();
  }

  async uploadToDropbox(
    blob: Blob,
    fileName: string,
  ): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append("file", blob, fileName);
    formData.append("fileName", fileName);

    const response = await fetchWithRetry("/api/share/dropbox", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Errore durante l'upload su Dropbox");
    }

    return response.json();
  }

  openWhatsApp(phone: string, message: string) {
    const normalized = normalizeItalianPhone(phone);
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/${normalized.replace("+", "")}?text=${encoded}`);
  }
}

export const shareService = ShareService.getInstance();
