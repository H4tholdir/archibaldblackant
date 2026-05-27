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
  onlyVatMissing: boolean;
};

function checkCustomerCompleteness(customer: Customer): CompletenessResult {
  const missing: string[] = [];
  const missingFields: MissingFieldKey[] = [];
  let onlyVatMissing = false;

  if (!customer.name) {
    missing.push('Ragione sociale mancante');
    missingFields.push('name');
  }

  if (!customer.vatNumber) {
    missing.push('P.IVA mancante');
    missingFields.push('vatNumber');
  } else if (customer.vatInvalid) {
    // VAT validation failed — requires human intervention, not auto-retry
    missing.push('P.IVA non valida');
    missingFields.push('vatValidatedAt');
  } else if (!customer.vatValidatedAt) {
    missing.push('P.IVA non validata');
    missingFields.push('vatValidatedAt');
    onlyVatMissing = true;
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

  // onlyVatMissing is valid only when the single missing issue is unvalidated VAT
  if (missingFields.length > 1) {
    onlyVatMissing = false;
  }

  return { ok: missingFields.length === 0, missing, missingFields, onlyVatMissing };
}

export { checkCustomerCompleteness, type CompletenessResult, type MissingFieldKey };
