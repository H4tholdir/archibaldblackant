import { describe, expect, test, vi } from 'vitest';
import { handleSendToVerona, type SendToVeronaBot, type SendToVeronaData } from './send-to-verona';
import type { DbPool } from '../../db/pool';

const CONFIRMED_HEADER = {
  salesStatus: 'Ordine aperto',
  documentStatus: 'Packing slip',
  transferStatus: 'In attesa di approvazione',
};

function createMockPool(): DbPool {
  const queryMock = vi.fn()
    .mockResolvedValueOnce({ rows: [{ current_state: 'bozza' }], rowCount: 1 }) // SELECT current_state
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE current_state
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT order_state_history
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE sent_to_verona_at
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE warehouse_items (batchMarkSold)
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE readOrderHeader confirmed
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
    readOrderHeader: vi.fn().mockResolvedValue(CONFIRMED_HEADER),
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

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    expect(bot.sendOrderToVerona).toHaveBeenCalledWith('ORD-001');
  });

  test('updates order state to inviato_verona via updateOrderState', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const stateUpdateCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE agents.order_records SET current_state'),
    );
    expect(stateUpdateCall).toBeDefined();
    expect(stateUpdateCall![1]).toEqual(['inviato_verona', expect.any(Number), 'ORD-001', 'user-1']);
  });

  test('executes 8 DB queries for audit trail, warehouse mark-sold, header readback, fresis lookup, and sibling propagation', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(8);
    expect(calls[0][0]).toContain('SELECT current_state');
    expect(calls[1][0]).toContain('UPDATE agents.order_records SET current_state');
    expect(calls[2][0]).toContain('INSERT INTO agents.order_state_history');
    expect(calls[3][0]).toContain('UPDATE agents.order_records SET sent_to_verona_at');
    expect(calls[4][0]).toContain('UPDATE agents.warehouse_items');
    expect(calls[5][0]).toContain('CASE WHEN');
    expect(calls[6][0]).toContain('SELECT id, items');
    expect(calls[7][0]).toContain('archibald_order_id');
  });

  test('inserts audit entry in order_state_history', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const historyInsert = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO agents.order_state_history'),
    );
    expect(historyInsert).toBeDefined();

    const params = historyInsert![1] as unknown[];
    expect(params).toEqual([
      'ORD-001', 'user-1', 'bozza', 'inviato_verona',
      'system', 'Sent to Verona', null, 'send-to-verona',
      expect.any(String), expect.any(String),
    ]);
  });

  test('returns success with sentToVeronaAt timestamp', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    const result = await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    expect(result.success).toBe(true);
    expect(result.sentToVeronaAt).toBeDefined();
    expect(typeof result.sentToVeronaAt).toBe('string');
  });

  test('throws when bot returns success: false', async () => {
    const pool = createMockPool();
    const bot = createMockBot({ success: false, message: 'Send failed' });

    await expect(
      handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0),
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
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE sent_to_verona_at
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE warehouse_items (batchMarkSold)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE readOrderHeader confirmed
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

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    const calls = queryMock.mock.calls;
    expect(calls).toHaveLength(10);

    const ftCounterCall = calls[7];
    expect(ftCounterCall[0]).toContain('INSERT INTO agents.ft_counter');
    expect(ftCounterCall[1]).toEqual([esercizio, 'user-1', 'FT', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);

    const updateCall = calls[8];
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

  test('propagates inviato_verona state to fresis_history records by archibald_order_id', async () => {
    const pool = createMockPool();
    const bot = createMockBot();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const siblingUpdate = calls[7];
    expect(siblingUpdate[0]).toContain('UPDATE agents.fresis_history');
    expect(siblingUpdate[0]).toContain('archibald_order_id');
    expect(siblingUpdate[0]).toContain("current_state = 'inviato_verona'");
    expect(siblingUpdate[1]).toEqual(['user-1', 'ORD-001']);
  });

  test('reports progress at 100 on completion', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const onProgress = vi.fn();

    await handleSendToVerona(pool, bot, sampleData, 'user-1', onProgress, undefined, 0);

    expect(onProgress).toHaveBeenCalledWith(100, expect.any(String));
  });

  test('returns early for ghost- orders without calling bot', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const ghostData: SendToVeronaData = { orderId: 'ghost-1742659200000' };

    const result = await handleSendToVerona(pool, bot, ghostData, 'user-1', vi.fn(), undefined, 0);

    expect(result.success).toBe(false);
    expect(bot.sendOrderToVerona).not.toHaveBeenCalled();
  });

  test('does not call bot.setProgressCallback for ghost- orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const ghostData: SendToVeronaData = { orderId: 'ghost-1742659200000' };

    await handleSendToVerona(pool, bot, ghostData, 'user-1', vi.fn(), undefined, 0);

    expect(bot.setProgressCallback).not.toHaveBeenCalled();
  });

  test('does not touch the DB for ghost- orders', async () => {
    const pool = createMockPool();
    const bot = createMockBot();
    const ghostData: SendToVeronaData = { orderId: 'ghost-1742659200000' };

    await handleSendToVerona(pool, bot, ghostData, 'user-1', vi.fn(), undefined, 0);

    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  describe('readOrderHeader retry', () => {
    test('chiama readOrderHeader una sola volta se il primo tentativo restituisce transferStatus confermato', async () => {
      const pool = createMockPool();
      const bot = createMockBot();

      await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

      expect(bot.readOrderHeader).toHaveBeenCalledTimes(1);
      expect(bot.readOrderHeader).toHaveBeenCalledWith('ORD-001');
    });

    test('riprova readOrderHeader finché transferStatus non è confermato', async () => {
      const pool = createMockPool();
      const bot = createMockBot();
      vi.mocked(bot.readOrderHeader)
        .mockResolvedValueOnce({ salesStatus: null, documentStatus: null, transferStatus: 'Modifica' })
        .mockResolvedValueOnce(CONFIRMED_HEADER);

      await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

      expect(bot.readOrderHeader).toHaveBeenCalledTimes(2);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const headerUpdate = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('CASE WHEN'),
      );
      expect(headerUpdate).toBeDefined();
      expect(headerUpdate![1][2]).toBe('In attesa di approvazione');
    });

    test('non scrive "modifica" in transfer_status anche se tutti i tentativi restituiscono "Modifica"', async () => {
      const pool = createMockPool();
      const bot = createMockBot();
      vi.mocked(bot.readOrderHeader).mockResolvedValue({
        salesStatus: 'Ordine aperto',
        documentStatus: null,
        transferStatus: 'Modifica',
      });

      await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

      expect(bot.readOrderHeader).toHaveBeenCalledTimes(3);
      const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
      const headerUpdate = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('CASE WHEN'),
      );
      // La query viene comunque eseguita (lastHeader non è null) ma il CASE WHEN in SQL
      // impedisce di scrivere 'modifica' nel DB
      expect(headerUpdate).toBeDefined();
      expect(headerUpdate![0]).toContain("lower($3) != 'modifica'");
    });

    test('salta il DB update di header quando readOrderHeader restituisce null su tutti i tentativi', async () => {
      const queryMock = vi.fn()
        .mockResolvedValueOnce({ rows: [{ current_state: 'bozza' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        // No readOrderHeader update (null returned)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT fresis_history
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE merged siblings
        .mockResolvedValue({ rows: [], rowCount: 0 });

      const pool: DbPool = {
        query: queryMock,
        end: vi.fn(),
        getStats: vi.fn().mockReturnValue({ totalCount: 0, idleCount: 0, waitingCount: 0 }),
      };
      const bot = createMockBot();
      vi.mocked(bot.readOrderHeader).mockResolvedValue(null);

      await handleSendToVerona(pool, bot, sampleData, 'user-1', vi.fn(), undefined, 0);

      expect(bot.readOrderHeader).toHaveBeenCalledTimes(3);
      const calls = queryMock.mock.calls;
      const headerUpdate = calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('CASE WHEN'),
      );
      expect(headerUpdate).toBeUndefined();
      // 7 query totali: senza la update dell'header
      expect(calls).toHaveLength(7);
    });
  });
});
