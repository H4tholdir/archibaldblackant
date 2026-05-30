type WaContext = {
  customerName: string;
  agentName: string;
  agentPhone: string;
  tone: 'cordiale' | 'formale' | 'urgente';
  invoices: Array<{ invoiceNumber: string; remainingAmount: number; daysPastDue: number }>;
  totalAmount: number;
};

const INTRO_WA: Record<WaContext['tone'], string> = {
  cordiale: 'le ricordiamo le seguenti fatture ancora aperte:',
  formale:  'la invitiamo a regolarizzare le seguenti posizioni:',
  urgente:  'siamo costretti a segnalare che le seguenti fatture risultano insolute:',
};

function eur(n: number): string {
  // Explicit formatting to avoid ICU data availability differences across environments.
  // Italian convention: thousands separator = '.', decimal separator = ','.
  const [intPart, decPart] = n.toFixed(2).split('.');
  const thousands = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${thousands},${decPart} €`;
}

export function buildWhatsappText(ctx: WaContext): string {
  const invoiceLines = ctx.invoices
    .map(i => `📄 ${i.invoiceNumber} — ${eur(i.remainingAmount)} (+${i.daysPastDue}gg)`)
    .join('\n');

  return `Gentile ${ctx.customerName},\n\n${INTRO_WA[ctx.tone]}\n\n${invoiceLines}\n\n💰 Totale: *${eur(ctx.totalAmount)}*\n\nPer confermare il pagamento o per chiarimenti, risponda pure a questo messaggio.\n\n${ctx.agentName} | Komet Dental${ctx.agentPhone ? '\n' + ctx.agentPhone : ''}`;
}
