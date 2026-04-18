import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createPool } from '../pool';
import {
  getDraftByUserId,
  createDraft,
  applyItemDelta,
  applyScalarUpdate,
  deleteDraftByUserId,
} from './order-drafts.repo';

const TEST_USER_ID = 'test-user-draft-001';
const DRAFT_PAYLOAD_EMPTY = { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false };

let pool: ReturnType<typeof createPool>;

describe.skipIf(process.env.CI === 'true' || !process.env.PG_HOST)('order-drafts.repo', () => {
  beforeAll(() => {
    pool = createPool({
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DATABASE || 'archibald',
      user: process.env.PG_USER || 'archibald',
      password: process.env.PG_PASSWORD || '',
      maxConnections: 2,
    });
  });

  afterEach(async () => {
    await pool.query('DELETE FROM agents.order_drafts WHERE user_id = $1', [TEST_USER_ID]);
  });

  describe('getDraftByUserId', () => {
    it('returns null when no draft exists', async () => {
      const result = await getDraftByUserId(pool, TEST_USER_ID);
      expect(result).toBeNull();
    });
  });

  describe('createDraft', () => {
    it('creates a draft and getDraftByUserId returns it', async () => {
      const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
      expect(draft.userId).toBe(TEST_USER_ID);
      expect(draft.payload.items).toEqual([]);
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(draft.id);
    });

    it('is idempotent (upsert on conflict)', async () => {
      const first = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
      const updatedPayload = { ...DRAFT_PAYLOAD_EMPTY, notes: 'aggiornato' };
      const second = await createDraft(pool, TEST_USER_ID, updatedPayload);
      expect(second.id).toBe(first.id);
      expect(second.payload.notes).toBe('aggiornato');
    });
  });

  describe('applyItemDelta', () => {
    it('item:add appends item to items array', async () => {
      const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
      const item = { id: 'item-1', article: 'ROSE001', productName: 'Rosa', quantity: 10, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 50, vat: 11, total: 61 };
      await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:add', item);
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched!.payload.items).toEqual([item]);
    });

    it('item:remove removes item by id', async () => {
      const itemA = { id: 'item-a', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
      const itemB = { id: 'item-b', article: 'GIRA002', productName: 'Girasole', quantity: 3, unitPrice: 3, vatRate: 22, discount: 0, subtotal: 9, vat: 1.98, total: 10.98 };
      const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [itemA, itemB] });
      await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'item-a' });
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched!.payload.items).toEqual([itemB]);
    });

    it('item:remove on non-existent id is a no-op', async () => {
      const item = { id: 'item-x', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
      const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
      await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:remove', { itemId: 'non-existent' });
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched!.payload.items).toEqual([item]);
    });

    it('item:edit merges changes into existing item', async () => {
      const item = { id: 'item-e', article: 'ROSE001', productName: 'Rosa', quantity: 5, unitPrice: 5, vatRate: 22, discount: 0, subtotal: 25, vat: 5.5, total: 30.5 };
      const draft = await createDraft(pool, TEST_USER_ID, { ...DRAFT_PAYLOAD_EMPTY, items: [item] });
      await applyItemDelta(pool, draft.id, TEST_USER_ID, 'item:edit', { itemId: 'item-e', changes: { quantity: 10, subtotal: 50 } });
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched!.payload.items).toEqual([{ ...item, quantity: 10, subtotal: 50 }]);
    });
  });

  describe('applyScalarUpdate', () => {
    it('merges field into payload', async () => {
      const draft = await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
      await applyScalarUpdate(pool, draft.id, TEST_USER_ID, 'notes', 'consegna urgente');
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched!.payload.notes).toBe('consegna urgente');
      expect(fetched!.payload.items).toEqual([]);
    });
  });

  describe('deleteDraftByUserId', () => {
    it('removes the draft', async () => {
      await createDraft(pool, TEST_USER_ID, DRAFT_PAYLOAD_EMPTY);
      await deleteDraftByUserId(pool, TEST_USER_ID);
      const fetched = await getDraftByUserId(pool, TEST_USER_ID);
      expect(fetched).toBeNull();
    });
  });
});
