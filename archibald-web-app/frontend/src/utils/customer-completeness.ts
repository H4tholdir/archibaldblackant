import type { Customer } from '../types/customer';

type MissingFieldKey =
  | 'name'
  | 'vatNumber'
  | 'vatValidatedAt'
  | 'pec_or_sdi'
  | 'street'
  | 'postalCode'
  | 'city';

type CompletenessResult = {
  ok: boolean;
  missing: string[];
  missingFields: MissingFieldKey[];
};

function checkCustomerCompleteness(customer: Customer): CompletenessResult {
  const missing: string[] = [];
  const missingFields: MissingFieldKey[] = [];

  if (!customer.name) {
    missing.push('Ragione sociale mancante');
    missingFields.push('name');
  }

  if (!customer.vatNumber) {
    missing.push('P.IVA mancante');
    missingFields.push('vatNumber');
  } else if (!customer.vatValidatedAt) {
    missing.push('P.IVA non validata');
    missingFields.push('vatValidatedAt');
  }

  if (!customer.pec && !customer.sdi) {
    missing.push('PEC o SDI mancante');
    missingFields.push('pec_or_sdi');
  }

  if (!customer.street) {
    missing.push('Indirizzo mancante');
    missingFields.push('street');
  }

  if (!customer.postalCode) {
    missing.push('CAP mancante');
    missingFields.push('postalCode');
  }

  if (!customer.city) {
    missing.push('Città mancante');
    missingFields.push('city');
  }

  return { ok: missingFields.length === 0, missing, missingFields };
}

export { checkCustomerCompleteness, type CompletenessResult, type MissingFieldKey };
