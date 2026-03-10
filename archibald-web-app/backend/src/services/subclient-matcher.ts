import type { DbPool } from '../db/pool.js';
import type { Subclient } from '../db/repositories/subclients.js';
import type { Customer } from '../db/repositories/customers.js';
import {
  getUnmatchedSubclients,
  setSubclientMatch,
} from '../db/repositories/subclients.js';
import { getCustomers } from '../db/repositories/customers.js';

type MatchResult = {
  matched: number;
  unmatched: number;
};

const MULTI_FIELD_THRESHOLD = 2;

function normalizeForComparison(value: string | null): string {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePhone(value: string | null): string {
  if (!value) return '';
  return value.replace(/[^0-9]/g, '');
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokensA.length === 0 || tokensB.size === 0) return 0;
  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) matches++;
  }
  return matches / Math.max(tokensA.length, tokensB.size);
}

function computeMultiFieldScore(sub: Subclient, cust: Customer): number {
  let score = 0;

  const nameScore = tokenOverlap(sub.ragioneSociale, cust.name);
  if (nameScore >= 0.5) score += 1;

  const subPhone = normalizePhone(sub.telefono);
  const custPhone = normalizePhone(cust.phone);
  const custMobile = normalizePhone(cust.mobile);
  if (subPhone.length >= 6 && (subPhone === custPhone || subPhone === custMobile)) {
    score += 1;
  }

  const subAddr = normalizeForComparison(sub.indirizzo);
  const custAddr = normalizeForComparison(cust.street);
  if (subAddr.length >= 5 && custAddr.length >= 5 && subAddr === custAddr) {
    score += 1;
  }

  return score;
}

async function matchSubclients(pool: DbPool, userId: string): Promise<MatchResult> {
  const unmatched = await getUnmatchedSubclients(pool);
  if (unmatched.length === 0) return { matched: 0, unmatched: 0 };

  const customers = await getCustomers(pool, userId);
  if (customers.length === 0) return { matched: 0, unmatched: unmatched.length };

  const vatIndex = new Map<string, Customer>();
  for (const c of customers) {
    if (c.vatNumber) {
      const normalized = normalizeForComparison(c.vatNumber);
      if (normalized) vatIndex.set(normalized, c);
    }
  }

  let matched = 0;

  for (const sub of unmatched) {
    if (sub.partitaIva) {
      const normalizedVat = normalizeForComparison(sub.partitaIva);
      const vatMatch = vatIndex.get(normalizedVat);
      if (vatMatch) {
        await setSubclientMatch(pool, sub.codice, vatMatch.customerProfile, 'vat');
        matched++;
        continue;
      }
    }

    let bestCustomer: Customer | null = null;
    let bestScore = 0;
    for (const c of customers) {
      const score = computeMultiFieldScore(sub, c);
      if (score > bestScore) {
        bestScore = score;
        bestCustomer = c;
      }
    }

    if (bestScore >= MULTI_FIELD_THRESHOLD && bestCustomer) {
      await setSubclientMatch(pool, sub.codice, bestCustomer.customerProfile, 'multi-field');
      matched++;
    }
  }

  return { matched, unmatched: unmatched.length - matched };
}

export {
  matchSubclients,
  computeMultiFieldScore,
  normalizeForComparison,
  normalizePhone,
  tokenOverlap,
  MULTI_FIELD_THRESHOLD,
  type MatchResult,
};
