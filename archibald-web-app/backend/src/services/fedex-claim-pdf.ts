import type { TrackingException } from '../db/repositories/tracking-exceptions';

export async function generateClaimPdf(exception: TrackingException): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({ headless: true });
  const page = await browser.newPage();

  const html = buildClaimHtml(exception);
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });

  await browser.close();
  return Buffer.from(pdf);
}

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function buildClaimHtml(ex: TrackingException): string {
  return `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 0; }
  h1 { font-size: 20px; color: #4d148c; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }
  .field label { font-size: 10px; color: #888; text-transform: uppercase; display: block; }
  .field span { font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700;
           background: #fff3e0; color: #e65100; }
  .signature-box { border: 1px solid #ccc; border-radius: 6px; padding: 16px; margin-top: 8px; height: 60px; }
  .footer { margin-top: 40px; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head><body>
  <h1>Dichiarazione Reclamo Spedizione FedEx</h1>
  <div style="font-size:12px;color:#888;">Generato il ${formatDateTime(new Date())}</div>

  <h2>Dati Spedizione</h2>
  <div class="grid">
    <div class="field"><label>Tracking Number</label><span style="font-family:monospace;">${ex.trackingNumber}</span></div>
    <div class="field"><label>Numero Ordine</label><span>${ex.orderNumber}</span></div>
    <div class="field"><label>Data Eccezione</label><span>${formatDateTime(ex.occurredAt)}</span></div>
    <div class="field"><label>Tipo Anomalia</label><span class="badge">${ex.exceptionType.toUpperCase()}</span></div>
  </div>

  <h2>Dettaglio Eccezione</h2>
  <div class="grid">
    <div class="field"><label>Codice Eccezione</label><span>${ex.exceptionCode ?? '—'}</span></div>
    <div class="field"><label>Descrizione</label><span>${ex.exceptionDescription}</span></div>
  </div>

  <h2>Stato Reclamo</h2>
  <div class="grid">
    <div class="field"><label>Stato</label><span>${ex.claimStatus ?? 'Non avviato'}</span></div>
    <div class="field"><label>Data invio</label><span>${formatDate(ex.claimSubmittedAt)}</span></div>
    ${ex.notes ? `<div class="field" style="grid-column:span 2"><label>Note</label><span>${ex.notes}</span></div>` : ''}
  </div>

  <h2>Firma Agente</h2>
  <p style="font-size:12px;color:#666;">Con la presente si dichiara che i dati riportati sono veritieri e si richiede formalmente l'apertura di un reclamo presso FedEx per il tracking number indicato.</p>
  <div class="grid" style="margin-top:16px;">
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Firma agente</div>
      <div class="signature-box"></div>
    </div>
    <div>
      <div style="font-size:11px;color:#888;margin-bottom:4px;">Data</div>
      <div class="signature-box"></div>
    </div>
  </div>

  <div class="footer">Documento generato automaticamente — Archibald Agent Platform</div>
</body></html>`;
}
