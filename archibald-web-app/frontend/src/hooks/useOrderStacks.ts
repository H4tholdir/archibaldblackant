import { useState, useMemo, useCallback } from "react";
import type { Order } from "../utils/orderGrouping";
import {
  buildStackMap,
  loadManualStacks,
  addManualStack as addManualStackToStorage,
  removeFromManualStack as removeFromStorage,
  dissolveManualStack as dissolveFromStorage,
  type OrderStack,
  type ManualStackEntry,
} from "../utils/orderStacking";

function useOrderStacks(orders: Order[]) {
  const [manualStacks, setManualStacks] = useState<ManualStackEntry[]>(
    loadManualStacks,
  );

  const { stackMap, orderIndex } = useMemo(
    () => buildStackMap(orders, manualStacks),
    [orders, manualStacks],
  );

  const getStackForOrder = useCallback(
    (orderId: string): OrderStack | null => {
      const stackId = orderIndex.get(orderId);
      if (!stackId) return null;
      return stackMap.get(stackId) ?? null;
    },
    [stackMap, orderIndex],
  );

  const createManualStack = useCallback((orderIds: string[]) => {
    addManualStackToStorage(orderIds);
    setManualStacks(loadManualStacks());
  }, []);

  const removeFromStack = useCallback(
    (stackId: string, orderId: string) => {
      removeFromStorage(stackId, orderId);
      setManualStacks(loadManualStacks());
    },
    [],
  );

  const dissolveStack = useCallback((stackId: string) => {
    dissolveFromStorage(stackId);
    setManualStacks(loadManualStacks());
  }, []);

  return {
    stackMap,
    orderIndex,
    getStackForOrder,
    createManualStack,
    removeFromStack,
    dissolveStack,
  } as const;
}

export { useOrderStacks };
