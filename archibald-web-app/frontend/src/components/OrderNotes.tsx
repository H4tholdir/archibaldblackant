import { useState, useEffect } from 'react';
import { useOrderNotes } from '../hooks/useOrderNotes';

type OrderNotesProps = {
  orderId: string;
  expanded: boolean;
  onNotesChanged?: () => void;
};

export function OrderNotes({ orderId, expanded, onNotesChanged }: OrderNotesProps) {
  const { notes, loading, fetchNotes, addNote, toggleNote, editNote, removeNote } = useOrderNotes(orderId);
  const [newNoteText, setNewNoteText] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    if (expanded) fetchNotes();
  }, [expanded, fetchNotes]);

  if (!expanded) return null;
  if (loading && notes.length === 0) return null;

  const checkedCount = notes.filter(n => n.checked).length;
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.position - b.position;
  });

  async function handleAddNote() {
    const trimmed = newNoteText.trim();
    if (!trimmed) return;
    await addNote(trimmed);
    setNewNoteText('');
    onNotesChanged?.();
  }

  async function handleToggle(noteId: number, checked: boolean) {
    await toggleNote(noteId, checked);
    onNotesChanged?.();
  }

  async function handleRemove(noteId: number) {
    await removeNote(noteId);
    onNotesChanged?.();
  }

  function startEdit(noteId: number, text: string) {
    setEditingId(noteId);
    setEditingText(text);
  }

  async function commitEdit(noteId: number) {
    const trimmed = editingText.trim();
    if (trimmed) await editNote(noteId, trimmed);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div style={{
      padding: '12px 16px',
      margin: '8px 12px',
      borderLeft: '3px solid #1976d2',
      backgroundColor: '#f0f7ff',
      borderRadius: '0 8px 8px 0',
      borderBottom: '2px solid #e0e0e0',
    }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 700,
          color: '#1565c0',
          marginBottom: isOpen ? '10px' : 0,
        }}
      >
        <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
          &#9654;
        </span>
        <span>Note</span>
        {notes.length > 0 && (
          <span style={{
            fontSize: '11px',
            padding: '1px 6px',
            borderRadius: '8px',
            backgroundColor: checkedCount === notes.length ? '#e8f5e9' : '#fff3e0',
            color: checkedCount === notes.length ? '#2e7d32' : '#e65100',
            fontWeight: 700,
          }}>
            {checkedCount}/{notes.length}
          </span>
        )}
      </div>

      {isOpen && (
        <div>
          {sortedNotes.map(note => (
            <div key={note.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 0',
              fontSize: '13px',
            }}>
              <input
                type="checkbox"
                checked={note.checked}
                onChange={() => handleToggle(note.id, !note.checked)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer', accentColor: '#1976d2' }}
              />
              {editingId === note.id ? (
                <input
                  autoFocus
                  type="text"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(note.id); }
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  onBlur={() => commitEdit(note.id)}
                  style={{
                    flex: 1,
                    padding: '2px 6px',
                    fontSize: '13px',
                    border: '1px solid #1976d2',
                    borderRadius: '4px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  onClick={(e) => { e.stopPropagation(); if (!note.checked) startEdit(note.id, note.text); }}
                  style={{
                    flex: 1,
                    textDecoration: note.checked ? 'line-through' : 'none',
                    color: note.checked ? '#999' : '#333',
                    cursor: note.checked ? 'default' : 'text',
                  }}
                  title={note.checked ? '' : 'Clicca per modificare'}
                >
                  {note.text}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(note.id); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#bbb',
                  fontSize: '14px',
                  padding: '2px 4px',
                  lineHeight: 1,
                }}
                title="Elimina nota"
              >
                &#10005;
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <input
              type="text"
              placeholder="Aggiungi nota..."
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNote(); } }}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
