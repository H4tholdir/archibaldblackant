import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Order } from "../types/order";
import {
  buildStackMap,
  loadManualStacks,
  MANUAL_STACKS_KEY,
  type OrderStack,
  type ManualStackEntry,
} from "../utils/orderStacking";
import {
  getOrderStacks,
  createOrderStack,
  dissolveOrderStack,
  removeFromOrderStack,
} from "../api/order-stacks";

function useOrderStacks(orders: Order[]) {
  const [manualStacks, setManualStacks] = useState<ManualStackEntry[]>([]);
  const migrationDone = useRef(false);

  const refreshStacks = useCallback(async () => {
    try {
      const apiStacks = await getOrderStacks();
      setManualStacks(
        apiStacks.map((s) => ({
          stackId: s.stackId,
          orderIds: s.orderIds,
          createdAt: new Date(s.createdAt).toISOString(),
          reason: s.reason || undefined,
        })),
      );
    } catch {
      // Fallback: if API fails on first load, try localStorage
      if (!migrationDone.current) {
        setManualStacks(loadManualStacks());
      }
    }
  }, []);

  useEffect(() => {
    const migrateAndLoad = async () => {
      const legacyStacks = loadManualStacks();

      if (legacyStacks.length > 0 && !migrationDone.current) {
        migrationDone.current = true;
        try {
          for (const legacy of legacyStacks) {
            if (legacy.orderIds.length >= 2) {
              await createOrderStack(legacy.orderIds, "");
            }
          }
          localStorage.removeItem(MANUAL_STACKS_KEY);
        } catch {
          // Migration failed; keep localStorage as fallback
        }
      }

      await refreshStacks();
    };

    migrateAndLoad();
  }, [refreshStacks]);

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

  const createManualStack = useCallback(
    async (orderIds: string[], reason = "") => {
      try {
        await createOrderStack(orderIds, reason);
        await refreshStacks();
      } catch (err) {
        console.error("Failed to create stack:", err);
      }
    },
    [refreshStacks],
  );

  const removeFromStack = useCallback(
    async (stackId: string, orderId: string) => {
      try {
        await removeFromOrderStack(stackId, orderId);
        await refreshStacks();
      } catch (err) {
        console.error("Failed to remove from stack:", err);
      }
    },
    [refreshStacks],
  );

  const dissolveStack = useCallback(
    async (stackId: string) => {
      try {
        await dissolveOrderStack(stackId);
        await refreshStacks();
      } catch (err) {
        console.error("Failed to dissolve stack:", err);
      }
    },
    [refreshStacks],
  );

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
