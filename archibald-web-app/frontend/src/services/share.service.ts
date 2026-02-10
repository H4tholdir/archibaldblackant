async function shareFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem("archibald_jwt");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
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

    const response = await shareFetch("/api/share/upload-pdf", {
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

    const response = await shareFetch("/api/share/email", {
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

    const response = await shareFetch("/api/share/dropbox", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Errore durante l'upload su Dropbox");
    }

    return response.json();
  }

  async shareViaWhatsApp(
    blob: Blob,
    fileName: string,
    message: string,
  ): Promise<void> {
    const file = new File([blob], fileName, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        text: message,
        files: [file],
      });
      return;
    }

    const { url } = await this.uploadPDFForSharing(blob, fileName);
    const fullMessage = `${message}\n${url}`;
    this.openWhatsApp(fullMessage);
  }

  openWhatsApp(message: string) {
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`);
  }
}

export const shareService = ShareService.getInstance();
