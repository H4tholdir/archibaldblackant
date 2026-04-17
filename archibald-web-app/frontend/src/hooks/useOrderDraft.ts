import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { getActiveDraft, createDraft, deleteActiveDraft } from '../api/drafts';
import {
  type OrderItem,
  type DraftPayload,
  type DraftScalarFields,
  EMPTY_DRAFT_PAYLOAD,
} from '../types/order-draft';

type PendingDelta = { seq: number; op: string; payload: unknown };

type UseOrderDraftOptions = { disabled: boolean };

type UseOrderDraftReturn = {
  draftState: DraftPayload;
  draftId: string | null;
  draftUpdatedAt: string | null;
  isLoading: boolean;
  hasDraft: boolean;
  remoteUpdateFlash: boolean;
  addItem: (item: OrderItem) => void;
  removeItem: (itemId: string) => void;
  editItem: (itemId: string, changes: Partial<OrderItem>) => void;
  updateScalar: <K extends keyof DraftScalarFields>(field: K, value: DraftScalarFields[K]) => void;
  ensureDraftCreated: (initialPayload: DraftPayload) => Promise<void>;
  discardDraft: () => Promise<void>;
  deleteDraft: () => Promise<void>;
};

function useOrderDraft({ disabled }: UseOrderDraftOptions): UseOrderDraftReturn {
  const navigate = useNavigate();
  const { send, subscribe } = useWebSocketContext();

  const [draftState, setDraftState] = useState<DraftPayload>(EMPTY_DRAFT_PAYLOAD);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!disabled);
  const [hasDraft, setHasDraft] = useState(false);
  const [remoteUpdateFlash, setRemoteUpdateFlash] = useState(false);

  const draftIdRef = useRef<string | null>(null);
  const pendingDeltas = useRef<PendingDelta[]>([]);
  const seqCounter = useRef(0);
  const scalarDebounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remoteFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCreatingDraftRef = useRef(false);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    setIsLoading(true);
    getActiveDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setDraftState(draft.payload);
          setDraftId(draft.id);
          setDraftUpdatedAt(draft.updatedAt);
          setHasDraft(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [disabled]);

  const sendDelta = useCallback(
    (op: string, payload: unknown) => {
      if (!draftIdRef.current) return;
      const seq = ++seqCounter.current;
      pendingDeltas.current.push({ seq, op, payload });
      void send('draft:delta', { draftId: draftIdRef.current, op, payload, seq });
    },
    [send],
  );

  const applyDeltaToState = useCallback((op: string, payload: unknown) => {
    if (op === 'item:add') {
      const item = payload as OrderItem;
      setDraftState((prev) => ({ ...prev, items: [...prev.items, item] }));
    } else if (op === 'item:remove') {
      const { itemId } = payload as { itemId: string };
      setDraftState((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
    } else if (op === 'item:edit') {
      const { itemId, changes } = payload as { itemId: string; changes: Partial<OrderItem> };
      setDraftState((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
      }));
    } else if (op === 'scalar:update') {
      const { field, value } = payload as { field: string; value: unknown };
      setDraftState((prev) => ({ ...prev, [field]: value }));
    }
  }, []);

  useEffect(() => {
    if (disabled) return;

    const unsubApplied = subscribe('draft:delta:applied', (raw) => {
      const { op, payload, seq } = raw as { op: string; payload: unknown; seq: number };
      const ownIndex = pendingDeltas.current.findIndex((d) => d.seq === seq);
      if (ownIndex !== -1) {
        pendingDeltas.current = pendingDeltas.current.filter((d) => d.seq !== seq);
        return;
      }
      applyDeltaToState(op, payload);
      setDraftUpdatedAt(new Date().toISOString());
      if (remoteFlashTimer.current) clearTimeout(remoteFlashTimer.current);
      setRemoteUpdateFlash(true);
      remoteFlashTimer.current = setTimeout(() => setRemoteUpdateFlash(false), 3000);
    });

    const unsubSubmitted = subscribe('draft:submitted', () => {
      navigate('/pending-orders');
    });

    const unsubReconnected = subscribe('WS_RECONNECTED', async () => {
      if (!draftIdRef.current) return;
      try {
        const fresh = await getActiveDraft();
        if (fresh) {
          setDraftState(fresh.payload);
          setDraftUpdatedAt(fresh.updatedAt);
          for (const delta of pendingDeltas.current) {
            void send('draft:delta', { draftId: fresh.id, op: delta.op, payload: delta.payload, seq: delta.seq });
          }
        }
      } catch {
        // silenzioso
      }
    });

    return () => {
      unsubApplied();
      unsubSubmitted();
      unsubReconnected();
    };
  }, [disabled, subscribe, navigate, send, applyDeltaToState]);

  useEffect(() => {
    const flashTimer = remoteFlashTimer;
    const debounceTimers = scalarDebounceTimers;
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      debounceTimers.current.forEach(clearTimeout);
      debounceTimers.current.clear();
    };
  }, []);

  const ensureDraftCreated = useCallback(
    async (initialPayload: DraftPayload): Promise<void> => {
      if (draftIdRef.current || isCreatingDraftRef.current) return;
      isCreatingDraftRef.current = true;
      try {
        const draft = await createDraft(initialPayload);
        setDraftState(draft.payload);
        setDraftId(draft.id);
        setDraftUpdatedAt(draft.updatedAt);
        setHasDraft(true);
      } finally {
        isCreatingDraftRef.current = false;
      }
    },
    [],
  );

  const addItem = useCallback(
    (item: OrderItem) => {
      setDraftState((prev) => ({ ...prev, items: [...prev.items, item] }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:add', item);
    },
    [sendDelta],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      setDraftState((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:remove', { itemId });
    },
    [sendDelta],
  );

  const editItem = useCallback(
    (itemId: string, changes: Partial<OrderItem>) => {
      setDraftState((prev) => ({
        ...prev,
        items: prev.items.map((i) => (i.id === itemId ? { ...i, ...changes } : i)),
      }));
      setDraftUpdatedAt(new Date().toISOString());
      sendDelta('item:edit', { itemId, changes });
    },
    [sendDelta],
  );

  const updateScalar = useCallback(
    <K extends keyof DraftScalarFields>(field: K, value: DraftScalarFields[K]) => {
      setDraftState((prev) => ({ ...prev, [field]: value }));
      setDraftUpdatedAt(new Date().toISOString());

      const existing = scalarDebounceTimers.current.get(field as string);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        scalarDebounceTimers.current.delete(field as string);
        sendDelta('scalar:update', { field, value });
      }, 800);
      scalarDebounceTimers.current.set(field as string, timer);
    },
    [sendDelta],
  );

  const discardDraft = useCallback(async () => {
    await deleteActiveDraft(false);
    setDraftState(EMPTY_DRAFT_PAYLOAD);
    setDraftId(null);
    setDraftUpdatedAt(null);
    setHasDraft(false);
    pendingDeltas.current = [];
    seqCounter.current = 0;
  }, []);

  const deleteDraft = useCallback(async () => {
    await deleteActiveDraft(true);
    setDraftState(EMPTY_DRAFT_PAYLOAD);
    setDraftId(null);
    setDraftUpdatedAt(null);
    setHasDraft(false);
    pendingDeltas.current = [];
    seqCounter.current = 0;
  }, []);

  return {
    draftState,
    draftId,
    draftUpdatedAt,
    isLoading,
    hasDraft,
    remoteUpdateFlash,
    addItem,
    removeItem,
    editItem,
    updateScalar,
    ensureDraftCreated,
    discardDraft,
    deleteDraft,
  };
}

export { useOrderDraft, type UseOrderDraftReturn };
