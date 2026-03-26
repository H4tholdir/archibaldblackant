import { fetchWithRetry } from '../utils/fetch-with-retry';

type SpecialBonus = {
  id: number;
  userId: string;
  title: string;
  amount: number;
  receivedAt: string;
  notes: string | null;
  createdAt: string;
};

type BonusCondition = {
  id: number;
  userId: string;
  title: string;
  rewardAmount: number;
  conditionType: 'budget' | 'manual';
  budgetThreshold: number | null;
  isAchieved: boolean;
  achievedAt: string | null;
  createdAt: string;
};

type CreateSpecialBonusParams = {
  title: string;
  amount: number;
  receivedAt: string;
  notes?: string;
};

type CreateBonusConditionParams = {
  title: string;
  rewardAmount: number;
  conditionType: 'budget' | 'manual';
  budgetThreshold?: number;
};

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('archibald_jwt');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function getSpecialBonuses(): Promise<SpecialBonus[]> {
  const res = await fetchWithRetry('/api/bonuses/special', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Errore caricamento premi speciali');
  const data = await res.json();
  return data.data as SpecialBonus[];
}

async function createSpecialBonus(params: CreateSpecialBonusParams): Promise<SpecialBonus> {
  const res = await fetchWithRetry('/api/bonuses/special', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Errore creazione premio speciale');
  const data = await res.json();
  return data.data as SpecialBonus;
}

async function deleteSpecialBonus(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/bonuses/special/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore eliminazione premio speciale');
}

async function getBonusConditions(): Promise<BonusCondition[]> {
  const res = await fetchWithRetry('/api/bonuses/conditions', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Errore caricamento condizioni obiettivo');
  const data = await res.json();
  return data.data as BonusCondition[];
}

async function createBonusCondition(params: CreateBonusConditionParams): Promise<BonusCondition> {
  const res = await fetchWithRetry('/api/bonuses/conditions', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Errore creazione condizione obiettivo');
  const data = await res.json();
  return data.data as BonusCondition;
}

async function achieveBonusCondition(id: number): Promise<BonusCondition> {
  const res = await fetchWithRetry(`/api/bonuses/conditions/${id}/achieve`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore aggiornamento condizione');
  const data = await res.json();
  return data.data as BonusCondition;
}

async function deleteBonusCondition(id: number): Promise<void> {
  const res = await fetchWithRetry(`/api/bonuses/conditions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Errore eliminazione condizione obiettivo');
}

export {
  getSpecialBonuses, createSpecialBonus, deleteSpecialBonus,
  getBonusConditions, createBonusCondition, achieveBonusCondition, deleteBonusCondition,
};
export type { SpecialBonus, BonusCondition, CreateSpecialBonusParams, CreateBonusConditionParams };
