import { describe, expect, test, vi } from 'vitest';
import { buildCustomerDiff, handleUpdateCustomer } from './update-customer';

function makePool() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

function makeSuccessBot() {
  return {
    navigateToEditCustomerById: vi.fn().mockResolvedValue(undefined),
    updateCustomerSurgical: vi.fn().mockResolvedValue({ name: 'Test Cliente' }),
    setProgressCallback: vi.fn(),
  };
}

describe('handleUpdateCustomer', () => {
  test('chiama setErpDetailReadAt dopo save riuscito', async () => {
    const pool = makePool();
    const bot = makeSuccessBot();
    await handleUpdateCustomer(pool as never, bot, { erpId: '57348', diff: { phone: '+39123' } }, 'u1', vi.fn());
    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
    const readAtCall = calls.find(([sql]) => sql.includes('erp_detail_read_at'));
    expect(readAtCall).toBeDefined();
  });
});

describe('buildCustomerDiff', () => {
  test('diff vuoto se nessuna modifica', () => {
    const original = { name: 'Test', email: 'test@test.com' };
    expect(buildCustomerDiff(original, original)).toEqual({});
  });

  test('diff include solo campi modificati', () => {
    const original = { name: 'Test', email: 'old@test.com' };
    const edited = { name: 'Test', email: 'new@test.com' };
    expect(buildCustomerDiff(original, edited)).toEqual({ email: 'new@test.com' });
  });

  test('diff include agentNotes', () => {
    const original = { agentNotes: null };
    const edited = { agentNotes: 'note' };
    expect(buildCustomerDiff(original, edited)).toEqual({ agentNotes: 'note' });
  });
});
