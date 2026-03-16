import type { CustomerFormData } from '../types/customer-form-data';
import type { VatLookupResult } from '../types/vat-lookup-result';

// Archibald ERP returns this sentinel when the company name requires manual lookup.
// Treat it as "no name available" to avoid overwriting the customer's real name.
const MANUAL_CHECK_SENTINEL = 'Manual Check From Erp!';

export function vatCompanyName(r: VatLookupResult): string {
  const name = r.parsed?.companyName ?? '';
  return name === MANUAL_CHECK_SENTINEL ? '' : name;
}

export type VatDiffField = {
  key: keyof CustomerFormData;
  label: string;
  current: string;
  archibald: string;
  preSelected: boolean;
};

type DiffFieldDef = {
  key: keyof CustomerFormData;
  label: string;
  archibaldValue: (r: VatLookupResult) => string;
};

const DIFF_FIELDS: DiffFieldDef[] = [
  { key: 'name',           label: 'Nome',    archibaldValue: r => vatCompanyName(r) },
  { key: 'street',         label: 'Via',     archibaldValue: r => r.parsed?.street       ?? '' },
  { key: 'postalCode',     label: 'CAP',     archibaldValue: r => r.parsed?.postalCode   ?? '' },
  { key: 'postalCodeCity', label: 'Città',   archibaldValue: r => r.parsed?.city         ?? '' },
  { key: 'pec',            label: 'PEC',     archibaldValue: r => r.pec                  ?? '' },
  { key: 'sdi',            label: 'SDI',     archibaldValue: r => r.sdi                  ?? '' },
];

export function buildVatDiff(
  current: CustomerFormData,
  vatResult: VatLookupResult,
): VatDiffField[] {
  return DIFF_FIELDS.map(({ key, label, archibaldValue }) => {
    const currentVal = (current[key] as string) ?? '';
    const archibaldVal = archibaldValue(vatResult);
    return {
      key,
      label,
      current: currentVal,
      archibald: archibaldVal,
      preSelected: currentVal.trim() === '' || currentVal === archibaldVal,
    };
  });
}
