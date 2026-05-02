import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUiOperationTracking } from './useUiOperationTracking';

const mockSend = vi.fn().mockResolvedValue(undefined);
vi.mock('../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({ send: mockSend, state: 'open', subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));

describe('useUiOperationTracking', () => {
  it('emits UI_OPERATION_STARTED on mount', () => {
    const args = {
      type: 'new-order' as const,
      customerId: 'c1',
      customerName: 'Test Customer',
      pendingOrderId: null,
    };
    renderHook(() => useUiOperationTracking(args));
    expect(mockSend).toHaveBeenCalledWith(
      'UI_OPERATION_STARTED',
      expect.objectContaining({ type: 'new-order', customerId: 'c1' }),
    );
  });

  it('emits UI_OPERATION_COMPLETED with pendingOrderId when complete() is called', () => {
    const args = {
      type: 'edit-pending' as const,
      customerId: 'c2',
      customerName: 'Another Customer',
      pendingOrderId: 'pending-123',
    };
    const { result } = renderHook(() => useUiOperationTracking(args));
    act(() => {
      result.current.complete('pending-123');
    });
    expect(mockSend).toHaveBeenCalledWith(
      'UI_OPERATION_COMPLETED',
      expect.objectContaining({ pendingOrderId: 'pending-123' }),
    );
  });

  it('does not emit UI_OPERATION_STARTED twice if re-rendered', () => {
    vi.clearAllMocks();
    const args = {
      type: 'new-order' as const,
      customerId: 'c3',
      customerName: 'C3',
      pendingOrderId: null,
    };
    const { rerender } = renderHook(() => useUiOperationTracking(args));
    rerender();
    rerender();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
