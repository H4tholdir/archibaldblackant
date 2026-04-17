import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  getDraftByUserId,
  createDraft,
  applyItemDelta,
  applyScalarUpdate,
  deleteDraftByUserId,
} from './order-drafts.repo';

const TEST_USER_ID = 'test-user-draft-001';
const DRAFT_PAYLOAD_EMPTY = { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false };

describe('order-drafts.repo', () => {
  beforeAll(() => {
    if (process.env.CI === 'true') return;
  });

  afterEach(async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    await pool.query('DELETE FROM agents.order_drafts WHERE user_id = $1', [TEST_USER_ID]);
  });

  it('getDraftByUserId returns null when no draft exists', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const result = await getDraftByUserId(pool, TEST_USER_ID);
    expect(result).toBeNull();
  });

  it('createDraft creates a draft and getDraftByUserId returns it', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    expect(draft.userId).toBe(TEST_USER_ID);
    expect(draft.payload.items).toEqual([]);
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(draft.id);
  });

  it('createDraft is idempotent (upsert on conflict)', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const first = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    const updatedPayload = { ...DRAFT_PAYLOAD_EMPTY, notes: 'aggiornato' };
    const second = await createDraft(pool, TEST_USER_ID, updatedPayload);
    expect(second.id).toBe(first.id);
    expect(second.payload.notes).toBe('aggiornato');
  });

  it('applyItemDelta item:add appends item to items array', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    const item = { id: 'item-1', article: 'ROSE001', productName: 'Rosa', quantity: 10, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 50, vat: 11, total: 61 };
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:add', item);
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
    expect((fetched!.payload.items as Array<{id: string}>)[0].id).toBe('item-1');
  });

  it('applyItemDelta item:remove removes item by id', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const itemA = { id: 'item-a', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const itemB = { id: 'item-b', article: 'GIRA002', productName: 'Girasole', quantity: 3, unitPrice: 3, vatRate: 22, discount: 0, subtotal: 9, vat: 1.98, total: 10.98 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [itemA, itemB] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'item-a' });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
    expect((fetched!.payload.items as Array<{id: string}>)[0].id).toBe('item-b');
  });

  it('applyItemDelta item:remove on non-existent id is a no-op', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const item = { id: 'item-x', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'non-existent' });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.items).toHaveLength(1);
  });

  it('applyItemDelta item:edit merges changes into existing item', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const item = { id: 'item-e', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
    const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
    await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:edit', { itemId: 'item-e', changes: { quantity: 10, subtotal: 50 } });
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    const items = fetched!.payload.items as Array<{quantity: number; subtotal: number; article: string}>;
    expect(items[0].quantity).toBe(10);
    expect(items[0].subtotal).toBe(50);
    expect(items[0].article).toBe('ROSE001');
  });

  it('applyScalarUpdate merges field into payload', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    await applyScalarUpdate(pool, draft.id, TEST_USER_ID, 'notes', 'consegna urgente');
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched!.payload.notes).toBe('consegna urgente');
    expect(fetched!.payload.items).toEqual([]);
  });

  it('deleteDraftByUserId removes the draft', async () => {
    if (process.env.CI === 'true') return;
    const pool = await getTestPool();
    await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
    await deleteDraftByUserId(pool, TEST_USER_ID);
    const fetched = await getDraftByUserId(pool, TEST_USER_ID);
    expect(fetched).toBeNull();
  });
});

async function getTestPool() {
  const { createPool } = await import('../pool');
  return createPool({
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'archibald',
    user: process.env.PG_USER || 'archibald',
    password: process.env.PG_PASSWORD || '',
    maxConnections: 2,
  });
}
