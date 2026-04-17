import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDraftMessageHandler } from './draft-realtime';

const mockApplyItemDelta = vi.fn();
const mockApplyScalarUpdate = vi.fn();

vi.mock('../db/repositories/order-drafts.repo', () => ({
  applyItemDelta: (...args: unknown[]) => mockApplyItemDelta(...args),
  applyScalarUpdate: (...args: unknown[]) => mockApplyScalarUpdate(...args),
}));

const mockBroadcast = vi.fn();
const DRAFT_ID = 'draft-uuid-123';
const USER_ID = 'user-abc';

function makeHandler() {
  return createDraftMessageHandler({ pool: {} as any, broadcast: mockBroadcast });
}

describe('createDraftMessageHandler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ignores messages that are not draft:delta', () => {
    const handler = makeHandler();
    handler(USER_ID, { type: 'other:event', payload: {}, timestamp: '2026-04-17T00:00:00Z' });
    expect(mockApplyItemDelta).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('calls applyItemDelta for item:add and broadcasts draft:delta:applied', async () => {
    mockApplyItemDelta.mockResolvedValue(undefined);
    const handler = makeHandler();
    const item = { id: 'item-1', article: 'ROSE001' };
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'item:add', payload: item, seq: 1 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockBroadcast).toHaveBeenCalled());
    expect(mockApplyItemDelta).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'item:add', item);
    expect(mockBroadcast).toHaveBeenCalledWith(USER_ID, expect.objectContaining({
      type: 'draft:delta:applied',
      payload: expect.objectContaining({ op: 'item:add', seq: 1 }),
    }));
  });

  it('calls applyItemDelta for item:remove', async () => {
    mockApplyItemDelta.mockResolvedValue(undefined);
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'item:remove', payload: { itemId: 'item-1' }, seq: 2 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockApplyItemDelta).toHaveBeenCalled());
    expect(mockApplyItemDelta).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'item:remove', { itemId: 'item-1' });
  });

  it('calls applyScalarUpdate for scalar:update', async () => {
    mockApplyScalarUpdate.mockResolvedValue(undefined);
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'scalar:update', payload: { field: 'notes', value: 'ciao' }, seq: 3 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await vi.waitFor(() => expect(mockApplyScalarUpdate).toHaveBeenCalled());
    expect(mockApplyScalarUpdate).toHaveBeenCalledWith(expect.anything(), DRAFT_ID, USER_ID, 'notes', 'ciao');
  });

  it('silently ignores unknown op types', async () => {
    const handler = makeHandler();
    handler(USER_ID, {
      type: 'draft:delta',
      payload: { draftId: DRAFT_ID, op: 'unknown:op', payload: {}, seq: 4 },
      timestamp: '2026-04-17T00:00:00Z',
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
