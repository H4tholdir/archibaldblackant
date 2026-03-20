import { useState, useCallback } from 'react';
import { getOrderNotes, createOrderNote, updateOrderNote, deleteOrderNote } from '../api/order-notes';
import type { OrderNote } from '../api/order-notes';

function useOrderNotes(orderId: string) {
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOrderNotes(orderId);
      setNotes(result);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const addNote = useCallback(async (text: string) => {
    const note = await createOrderNote(orderId, text);
    setNotes((prev) => [...prev, note]);
  }, [orderId]);

  const toggleNote = useCallback(async (noteId: number, checked: boolean) => {
    const updated = await updateOrderNote(orderId, noteId, { checked });
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  }, [orderId]);

  const editNote = useCallback(async (noteId: number, text: string) => {
    const updated = await updateOrderNote(orderId, noteId, { text });
    setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
  }, [orderId]);

  const removeNote = useCallback(async (noteId: number) => {
    await deleteOrderNote(orderId, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [orderId]);

  return { notes, loading, fetchNotes, addNote, toggleNote, editNote, removeNote };
}

export { useOrderNotes };
