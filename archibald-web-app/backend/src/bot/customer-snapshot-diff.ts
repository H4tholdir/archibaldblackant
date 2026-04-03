import type { CustomerFormData, CustomerSnapshot } from '../types.js';

export type FieldDivergence = {
  field: string;
  sent: string | null;
  actual: string | null;
};

type ComparableField = {
  formKey: keyof CustomerFormData;
  snapKey: keyof NonNullable<CustomerSnapshot>;
};

const COMPARABLE_FIELDS: ComparableField[] = [
  { formKey: 'name',         snapKey: 'name' },
  { formKey: 'vatNumber',    snapKey: 'vatNumber' },
  { formKey: 'fiscalCode',   snapKey: 'fiscalCode' },
  { formKey: 'pec',          snapKey: 'pec' },
  { formKey: 'sdi',          snapKey: 'sdi' },
  { formKey: 'notes',        snapKey: 'notes' },
  { formKey: 'street',       snapKey: 'street' },
  { formKey: 'postalCode',   snapKey: 'postalCode' },
  { formKey: 'phone',        snapKey: 'phone' },
  { formKey: 'mobile',       snapKey: 'mobile' },
  { formKey: 'email',        snapKey: 'email' },
  { formKey: 'url',          snapKey: 'url' },
  { formKey: 'attentionTo',  snapKey: 'attentionTo' },
  { formKey: 'deliveryMode', snapKey: 'deliveryMode' },
  { formKey: 'paymentTerms', snapKey: 'paymentTerms' },
  { formKey: 'lineDiscount', snapKey: 'lineDiscount' },
];

function normalize(value: string | null | undefined, field: string): string {
  if (value == null || value === '') return '';
  const trimmed = value.trim().toLowerCase();
  if (field === 'postalCode' && trimmed === 'n/a') return '';
  if (field === 'url' && trimmed === 'nd.it') return '';
  return trimmed;
}

export function diffSnapshot(
  snapshot: CustomerSnapshot,
  formData: CustomerFormData,
): FieldDivergence[] {
  if (snapshot === null) return [];

  const divergences: FieldDivergence[] = [];

  for (const { formKey, snapKey } of COMPARABLE_FIELDS) {
    const sentRaw = formData[formKey] as string | undefined;
    const actualRaw = snapshot[snapKey] as string | null;

    const sent = normalize(sentRaw, formKey);
    const actual = normalize(actualRaw, formKey);

    if (sent !== actual) {
      divergences.push({ field: formKey, sent, actual });
    }
  }

  return divergences;
}
