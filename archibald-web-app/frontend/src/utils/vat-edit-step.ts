import type { Customer } from '../types/customer';

export type VatEditStepDecision =
  | 'force-vat-input'       // → step { kind: "vat-input" }
  | 'auto-validate'         // → step { kind: "vat-processing" } + auto-submit su READY
  | 'show-validated-check'; // → step { kind: "vat-edit-check" }

export function determineVatEditStep(customer: Customer): VatEditStepDecision {
  const hasVat = !!customer.vatNumber && customer.vatNumber.trim().length > 0;

  if (!hasVat) return 'force-vat-input';
  if (!customer.vatValidatedAt) return 'auto-validate';
  return 'show-validated-check';
}
