import { useState, useCallback, useEffect } from 'react';
import { getHiddenOrders, hideOrder as apiHideOrder, unhideOrder as apiUnhideOrder } from '../api/hidden-orders';

function useHiddenOrders() {
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const ids = await getHiddenOrders();
      setHiddenOrderIds(new Set(ids));
    } catch {
      // Silently fail — hidden orders is a non-critical feature
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hideOrder = useCallback(async (orderId: string) => {
    try {
      await apiHideOrder(orderId);
      setHiddenOrderIds((prev) => new Set([...prev, orderId]));
    } catch (err) {
      console.error('Failed to hide order:', err);
    }
  }, []);

  const unhideOrder = useCallback(async (orderId: string) => {
    try {
      await apiUnhideOrder(orderId);
      setHiddenOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    } catch (err) {
      console.error('Failed to unhide order:', err);
    }
  }, []);

  const isHidden = useCallback((orderId: string) => hiddenOrderIds.has(orderId), [hiddenOrderIds]);

  return { hiddenOrderIds, hideOrder, unhideOrder, isHidden, refresh } as const;
}

export { useHiddenOrders };
