import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useOrderDraft } from './useOrderDraft';
import type { OrderItem } from '../types/order-draft';

const mockGetActiveDraft = vi.fn();
const mockCreateDraft = vi.fn();
const mockDeleteActiveDraft = vi.fn();
const mockWsSend = vi.fn<(type: string, payload: unknown) => Promise<void>>();
const mockWsSubscribe = vi.fn<(eventType: string, callback: (payload: unknown) => void) => () => void>();

vi.mock('../api/drafts', () => ({
  getActiveDraft: (...args: unknown[]) => mockGetActiveDraft(...args),
  createDraft: (...args: unknown[]) => mockCreateDraft(...args),
  deleteActiveDraft: (...args: unknown[]) => mockDeleteActiveDraft(...args),
}));

vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    state: 'connected',
    send: mockWsSend,
    subscribe: (eventType: string, callback: (payload: unknown) => void) => {
      mockWsSubscribe(eventType, callback);
      return () => {};
    },
    unsubscribe: vi.fn(),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  <MemoryRouter>{children}</MemoryRouter>;

const ITEM_A: OrderItem = {
  id: 'item-a',
  productId: 'p1',
  article: 'ROSE001',
  productName: 'Rosa',
  quantity: 5,
  unitPrice: 5,
  vatRate: 22,
  discount: 0,
  subtotal: 25,
  vat: 5.5,
  total: 30.5,
};

describe('useOrderDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockWsSend.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads null draft on mount and hasDraft is false', async () => {
    mockGetActiveDraft.mockResolvedValue(null);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasDraft).toBe(false);
    expect(result.current.draftState.items).toEqual([]);
  });

  it('loads existing draft and hasDraft is true', async () => {
    const serverDraft = {
      id: 'draft-1',
      userId: 'u1',
      payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '5', notes: 'test', deliveryAddressId: null, noShipping: false },
      createdAt: '2026-04-17T00:00:00Z',
      updatedAt: '2026-04-17T00:00:00Z',
    };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasDraft).toBe(true);
    expect(result.current.draftState.items).toEqual([ITEM_A]);
    expect(result.current.draftState.globalDiscountPercent).toBe('5');
  });

  it('addItem updates local state optimistically and sends WS delta', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.addItem(ITEM_A); });

    expect(result.current.draftState.items).toHaveLength(1);
    expect(result.current.draftState.items[0].id).toBe('item-a');
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'item:add', payload: ITEM_A }));
  });

  it('removeItem updates local state and sends WS delta', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.removeItem('item-a'); });

    expect(result.current.draftState.items).toHaveLength(0);
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'item:remove', payload: { itemId: 'item-a' } }));
  });

  it('updateScalar applies immediately and debounces WS send by 800ms', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.updateScalar('notes', 'prima'); });
    act(() => { result.current.updateScalar('notes', 'seconda'); });

    expect(result.current.draftState.notes).toBe('seconda');
    expect(mockWsSend).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(800); });

    expect(mockWsSend).toHaveBeenCalledTimes(1);
    expect(mockWsSend).toHaveBeenCalledWith('draft:delta', expect.objectContaining({ op: 'scalar:update', payload: { field: 'notes', value: 'seconda' } }));
  });

  it('is disabled when disabled:true (no API calls, no WS)', async () => {
    const { result } = renderHook(() => useOrderDraft({ disabled: true }), { wrapper });
    await Promise.resolve();
    expect(mockGetActiveDraft).not.toHaveBeenCalled();
    expect(result.current.hasDraft).toBe(false);
  });

  it('discardDraft calls deleteActiveDraft and resets state', async () => {
    const serverDraft = { id: 'draft-1', userId: 'u1', payload: { customer: null, subClient: null, items: [ITEM_A], globalDiscountPercent: '0', notes: '', deliveryAddressId: null, noShipping: false }, createdAt: '', updatedAt: '' };
    mockGetActiveDraft.mockResolvedValue(serverDraft);
    mockDeleteActiveDraft.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOrderDraft({ disabled: false }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.discardDraft(); });

    expect(mockDeleteActiveDraft).toHaveBeenCalledWith(false);
    expect(result.current.draftState.items).toHaveLength(0);
    expect(result.current.hasDraft).toBe(false);
  });
});
