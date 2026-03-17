import type { Customer } from '../types/customer';

type CompletenessResult = {
  ok: boolean;
  missing: string[];
};

function checkCustomerCompleteness(customer: Customer): CompletenessResult {
  const missing: string[] = [];
  if (!customer.vatValidatedAt)        missing.push('P.IVA non validata');
  if (!customer.pec && !customer.sdi)  missing.push('PEC o SDI mancante');
  if (!customer.street)                missing.push('Indirizzo mancante');
  if (!customer.postalCode)            missing.push('CAP mancante');
  return { ok: missing.length === 0, missing };
}

export { checkCustomerCompleteness, type CompletenessResult };
