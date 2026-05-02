import type { ErrorClass } from './types';

const ERP_UNREACHABLE_PATTERNS: RegExp[] = [
  /econnrefused/i,
  /etimedout.*login/i,
  /certificate/i,
  // 500/502/503 = guasti lato ERP (internal error, bad gateway, unavailable)
  // 404/401 e navigation timeout = errori applicativi, non infrastrutturali
  /\b50[023]\b/,
];

export function classifyError(err: unknown): ErrorClass {
  if (!(err instanceof Error)) return 'application_error';
  const msg = err.message ?? '';
  const lower = msg.toLowerCase();

  for (const pattern of ERP_UNREACHABLE_PATTERNS) {
    if (pattern.test(lower)) return 'erp_unreachable';
  }

  return 'application_error';
}
