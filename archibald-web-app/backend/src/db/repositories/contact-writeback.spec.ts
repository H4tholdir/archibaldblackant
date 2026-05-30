import { describe, it, expect, vi } from 'vitest';
import type { DbPool } from '../pool';

// Mock enqueueWithDedup PRIMA dell'import del modulo sotto test
vi.mock('./agent-queue', () => ({
  enqueueWithDedup: vi.fn().mockResolvedValue(undefined),
}));

import { updateCustomerContactAndQueueErp } from './contact-writeback';
import { enqueueWithDedup } from './agent-queue';

const enqueueMock = vi.mocked(enqueueWithDedup);

describe('updateCustomerContactAndQueueErp', () => {
  it('setta contact_write_pending_at e accoda update-customer', async () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const pool = { query: queryMock } as unknown as DbPool;

    await updateCustomerContactAndQueueErp(pool, 'u1', '55.226', { email: 'test@x.it' });

    // Verifica UPDATE con contact_write_pending_at e email
    const [firstCall] = queryMock.mock.calls;
    expect(firstCall[0]).toContain('contact_write_pending_at');
    expect(firstCall[0]).toContain('email');

    // Verifica enqueue update-customer
    expect(enqueueMock).toHaveBeenCalledOnce();
    expect(enqueueMock).toHaveBeenCalledWith(pool, expect.objectContaining({
      userId: 'u1',
      taskType: 'update-customer',
    }));
  });
});
