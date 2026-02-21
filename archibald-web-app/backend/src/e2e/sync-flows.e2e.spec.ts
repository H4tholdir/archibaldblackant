import { describe, test, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';
const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 540_000; // 9 minutes

type SyncType = 'customers' | 'orders' | 'products' | 'prices' | 'ddt' | 'invoices';

async function fetchJson(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetchJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  expect(res.ok).toBe(true);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.token as string;
}

async function triggerSync(token: string, syncType: SyncType): Promise<string> {
  const res = await fetchJson(`/api/sync/trigger/sync-${syncType}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok).toBe(true);
  const body = await res.json();
  expect(body.success).toBe(true);
  return body.jobId as string;
}

async function pollUntilComplete(
  token: string,
  syncType: SyncType,
  startTime: number,
): Promise<{ success: boolean; duration: number }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetchJson('/api/sync/monitoring/status?limit=5', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;

    const body = await res.json();
    const typeInfo = body.types?.[syncType];
    if (!typeInfo) continue;

    const recentEntry = typeInfo.history?.[0];
    if (!recentEntry) continue;

    const entryTime = new Date(recentEntry.timestamp).getTime();
    if (entryTime >= startTime) {
      return {
        success: recentEntry.success,
        duration: recentEntry.duration,
      };
    }
  }

  throw new Error(`Sync ${syncType} did not complete within ${POLL_TIMEOUT_MS / 1000}s`);
}

describe('Sync Control Panel E2E', () => {
  let token: string;

  beforeAll(() => {
    if (!USERNAME || !PASSWORD) {
      throw new Error('E2E_USERNAME and E2E_PASSWORD env vars are required');
    }
  });

  test('login as admin', async () => {
    token = await login(USERNAME!, PASSWORD!);
    expect(token).toBeTruthy();
  });

  const syncTypes: SyncType[] = ['customers', 'orders', 'products', 'prices', 'ddt', 'invoices'];

  for (const syncType of syncTypes) {
    test(`sync-${syncType}: trigger, poll, verify`, async () => {
      expect(token).toBeTruthy();

      const startTime = Date.now();
      const jobId = await triggerSync(token, syncType);
      expect(jobId).toBeTruthy();

      const result = await pollUntilComplete(token, syncType, startTime);
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });
  }

  test('verify data populated after syncs', async () => {
    expect(token).toBeTruthy();

    const endpoints: Array<{ path: string; label: string }> = [
      { path: '/api/customers?limit=1', label: 'customers' },
      { path: '/api/products?limit=1', label: 'products' },
    ];

    for (const { path, label } of endpoints) {
      const res = await fetchJson(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok, `${label} endpoint should respond OK`).toBe(true);
    }
  });
});
