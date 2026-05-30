type InvoiceRow = {
  invoiceNumber: string;
  remainingAmount: number;
  dueDate: string | null;
  daysPastDue: number;
};

type EmailContext = {
  customerName: string;
  agentName: string;
  agentTitle: string;
  agentEmail: string;
  agentPhone: string;
  tone: 'cordiale' | 'formale' | 'urgente';
  invoices: InvoiceRow[];
  totalAmount: number;
};

function eur(n: number): string {
  // Explicit formatting to avoid ICU data availability differences across environments.
  // Italian convention: thousands separator = '.', decimal separator = ','.
  const [intPart, decPart] = n.toFixed(2).split('.');
  const thousands = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${thousands},${decPart} €`;
}

const SUBJECT: Record<EmailContext['tone'], (n: number, total: number) => string> = {
  cordiale: (n, t) => `Promemoria pagamento — ${n} fatture · ${eur(t)}`,
  formale:  (n, t) => `Sollecito pagamento — ${n} fatture · ${eur(t)}`,
  urgente:  (n, t) => `⚠ Sollecito urgente — ${n} fatture insolute · ${eur(t)}`,
};

const INTRO: Record<EmailContext['tone'], string> = {
  cordiale: 'Le ricordiamo che le seguenti fatture risultano ancora in sospeso.',
  formale:  'La invitiamo a regolarizzare le seguenti posizioni entro i prossimi giorni.',
  urgente:  'Siamo costretti a segnalare che le seguenti fatture risultano ancora insolute e richiedono la Sua <strong>immediata attenzione</strong>.',
};

const HEADER_BG: Record<EmailContext['tone'], string> = {
  cordiale: '#1e3a5f',
  formale:  '#78350f',
  urgente:  '#7f1d1d',
};

export function buildEmailContent(ctx: EmailContext): { subject: string; html: string; replyTo: string } {
  const subject = SUBJECT[ctx.tone](ctx.invoices.length, ctx.totalAmount);
  const headerBg = HEADER_BG[ctx.tone];

  const tableRows = ctx.invoices.map(inv => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;font-weight:700">${inv.invoiceNumber}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;text-align:right;font-weight:700">${eur(inv.remainingAmount)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;color:#991b1b">${inv.dueDate ?? '—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #fee2e2;text-align:right">
        <span style="background:#7f1d1d;color:#fca5a5;font-size:9px;padding:1px 5px;border-radius:3px">+${inv.daysPastDue} gg</span>
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif">
<div style="max-width:560px;margin:20px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
  <div style="background:${headerBg};padding:14px 20px">
    <div style="font-size:14px;font-weight:700;color:#fef2f2">Komet Dental Italy</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.7);margin-top:2px">Risposta automatica — rispondere a ${ctx.agentEmail}</div>
  </div>
  <div style="padding:20px">
    <p style="font-size:13px;margin-bottom:14px">Gentile <strong>${ctx.customerName}</strong>,</p>
    <p style="font-size:12px;line-height:1.6;margin-bottom:14px;color:#334155">${INTRO[ctx.tone]}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Fattura</th>
          <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Importo</th>
          <th style="text-align:left;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Scaduta il</th>
          <th style="text-align:right;padding:7px 10px;border-bottom:2px solid #e2e8f0;color:#64748b">Giorni</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
      <tfoot>
        <tr style="background:#fef3c7">
          <td colspan="2" style="padding:9px 10px;font-weight:800;font-size:13px;border-top:2px solid #f59e0b;color:#92400e">Totale insoluto</td>
          <td colspan="2" style="padding:9px 10px;text-align:right;font-weight:800;font-size:15px;color:#92400e;border-top:2px solid #f59e0b">${eur(ctx.totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:4px">
      <div style="font-size:11px;font-weight:700;color:#1e293b">${ctx.agentName}</div>
      <div style="font-size:10px;color:#64748b">${ctx.agentTitle}</div>
      <div style="font-size:10px;color:#3b82f6">${ctx.agentEmail}${ctx.agentPhone ? ' · ' + ctx.agentPhone : ''}</div>
    </div>
    <div style="margin-top:14px;padding:8px;background:#f8fafc;border-radius:6px;font-size:9px;color:#94a3b8;text-align:center">
      Inviato automaticamente da Formicanera.com per conto di ${ctx.agentName}.
    </div>
  </div>
</div>
</body></html>`;

  return { subject, html, replyTo: ctx.agentEmail };
}
