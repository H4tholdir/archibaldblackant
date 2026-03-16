type CustomerCompletenessInput = {
  vat_validated_at: string | null;
  pec: string | null;
  sdi: string | null;
  street: string | null;
  postal_code: string | null;
};

function isCustomerComplete(customer: CustomerCompletenessInput): boolean {
  if (!customer.vat_validated_at)            return false;
  if (!customer.pec && !customer.sdi)        return false;
  if (!customer.street)                      return false;
  if (!customer.postal_code)                 return false;
  return true;
}

export { isCustomerComplete, type CustomerCompletenessInput };
