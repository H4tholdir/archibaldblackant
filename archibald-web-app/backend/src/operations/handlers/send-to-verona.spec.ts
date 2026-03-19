import { describe, expect, test, vi } from 'vitest';
import { handleSendToVerona, type SendToVeronaBot, type SendToVeronaData } from './send-to-verona';
import type { DbPool } from '../../db/pool';

function createMockPool(): DbPool {
  const queryMock = vi.fn()
    .mockResolvedValueOnce({ rows: [{ current_state: 'bozza' }], rowCount: 1 }) // SELECT current_state
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE current_state
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT order_state_history
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE sent_to_milano_at
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT fresis_history (no records)
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE merged siblings
    .mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    query: queryMock,
    end: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
  };
}

function createMockBot(result = { success: true, message: 'Sent to Verona' }): SendToVeronaBot {
  return {
    sendOrderToVerona: vi.fn().mockResolvedValue(result),
    setProgressCallback: vi.fn(),
  };
}

const sampleData: SendToVeronaData = {
  orderId: 'ORD-001',
};

describe('handleSendToVerona', () => {
  test('calls bot.sendOrderToVerona with orderId', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(bot.sendOrderToVerona).toHaveBeenCalledWith('ORD-001');
  });

  test('updates order state to inviato_milano via updateOrderState', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const stateUpdateCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.order_records SET current_state'),
    );
    expect(stateUpdateCall).toBeDefined();
    expect(stateUpdateCall![1]).toEqual(['inviato_milano', expect.any(Number), 'ORD-001', 'user-1']);
  });

  test('executes 6 DB queries for audit trail, fresis lookup, and sibling propagation', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(6);
    expect(calls[0][0]).toContain('SELECT current_state');
    expect(calls[1][0]).toContain('UPDATE agents.order_records SET current_state');
    expect(calls[2][0]).toContain('INSERT INTO agents.order_state_history');
    expect(calls[3][0]).toContain('UPDATE agents.order_records SET sent_to_verona_at');
    expect(calls[4][0]).toContain('SELECT id, items');
    expect(calls[5][0]).toContain('merged_into_order_id');
  });

  test('inserts audit entry in order_state_history', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const historyInsert = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_state_history'),
    );
    expect(historyInsert).toBeDefined();

    const params = historyInsert![1] as unknown[];
    expect(params).toEqual([
      'ORD-001', 'user-1', 'bozza', 'inviato_milano',
      'system', 'Sent to Verona', null, 'send-to-verona',
      expect.any(String), expect.any(String),
    ]);
  });

  test('returns success with sentToMilanoAt timestamp', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    expect(result.success).toBe(true);
    expect(result.sentToMilanoAt).toBeDefined();
    expect(typeof result.sentToMilanoAt).toBe('string');
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Send failed' });

    await expect(
      handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn()),
    ).rejects.toThrow('Send failed');
  });

  test('generates FT arca_data for linked fresis_history records', async () => {
    const fresisRow = {
      id: 42,
      items: [{ articleCode: 'ART-1', description: 'Test article', quantity: 2, price: 10, vat: 22 }],
      sub_client_codice: 'CLI-001',
      sub_client_name: 'Test Client',
      sub_client_data: null,
      discount_percent: null,
      notes: null,
    };

    const queryMock = vi.fn()
      .mockResolvedValueOnce({ rows: [{ current_state: 'bozza' }], rowCount: 1 }) // SELECT current_state
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE current_state
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT order_state_history
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE sent_to_milano_at
      .mockResolvedValueOnce({ rows: [fresisRow], rowCount: 1 }) // SELECT fresis_history
      .mockResolvedValueOnce({ rows: [{ last_number: 7 }], rowCount: 1 }) // getNextFtNumber
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE fresis_history
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE merged siblings

    const pool: DbPool = {
      query: queryMock,
      end: vi.fn(),
      getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
    };
    const bot = createMockBot();
    const esercizio = String(new Date().getFullYear());

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = queryMock.mock.calls;
    expect(calls).toHaveLength(8);

    const ftCounterCall = calls[5];
    expect(ftCounterCall[0]).toContain('INSERT INTO agents.ft_counter');
    expect(ftCounterCall[1]).toEqual([esercizio, 'user-1', 'FT']);

    const updateCall = calls[6];
    expect(updateCall[0]).toContain('UPDATE agents.fresis_history');
    const updateParams = updateCall[1] as unknown[];
    const arcaDataJson = updateParams[0] as string;
    const parsedArcaData = JSON.parse(arcaDataJson);
    expect(parsedArcaData.testata.TIPODOC).toBe('FT');
    expect(parsedArcaData.testata.NUMERODOC).toBe('7');
    expect(parsedArcaData.testata.CODICECF).toBe('CLI-001');
    expect(parsedArcaData.righe).toHaveLength(1);
    expect(parsedArcaData.righe[0].CODICEARTI).toBe('ART-1');
    expect(parsedArcaData.righe[0].QUANTITA).toBe(2);
    expect(parsedArcaData.destinazione_diversa).toBeNull();
    expect(updateParams[1]).toBe(`FT 7/${esercizio}`);
    expect(updateParams[2]).toBe(42);
    expect(updateParams[3]).toBe('user-1');
  });

  test('propagates inviato_milano state to merged sibling fresis_history records', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn());

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const siblingUpdate = calls[5];
    expect(siblingUpdate[0]).toContain('UPDATE agents.fresis_history');
    expect(siblingUpdate[0]).toContain('merged_into_order_id');
    expect(siblingUpdate[0]).toContain("current_state = 'inviato_milano'");
    expect(siblingUpdate[1]).toEqual(['user-1', 'ORD-001']);
  });

  test('reports progress at 100 on completion', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });
});
