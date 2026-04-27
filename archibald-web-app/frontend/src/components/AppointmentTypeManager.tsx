import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  listAppointmentTypes,
  createAppointmentType,
  updateAppointmentType,
  deleteAppointmentType,
} from '../api/appointment-types';
import type { AppointmentType, CreateAppointmentTypeInput } from '../types/agenda';

const SWATCHES = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#64748b'];

type Props = { onClose: () => void };

export function AppointmentTypeManager({ onClose }: Props) {
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('📋');
  const [newColor, setNewColor] = useState('#2563eb');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  async function load() {
    const data = await listAppointmentTypes();
    setTypes(data);
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const input: CreateAppointmentTypeInput = {
      label: newLabel.trim(), emoji: newEmoji, colorHex: newColor,
      sortOrder: types.filter((t) => !t.isSystem).length + 7,
    };
    await createAppointmentType(input);
    setAdding(false); setNewLabel(''); setNewEmoji('📋'); setNewColor('#2563eb');
    void load();
  }

  async function handleRename(id: number) {
    if (!editLabel.trim()) return;
    await updateAppointmentType(id, { label: editLabel.trim() });
    setEditingId(null); void load();
  }

  async function handleDelete(id: number) {
    await deleteAppointmentType(id);
    void load();
  }

  const ROW_STYLE: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderBottom: '1px solid #f8fafc',
  };

  return (
    <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.12)', maxWidth: 420, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Tipi di appuntamento</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>I tipi sistema non possono essere eliminati</div>
        </div>
        <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16, color: '#64748b' }}>✕</button>
      </div>

      {types.map((t) => (
        <div key={t.id} style={ROW_STYLE}>
          <div style={{ fontSize: 18, width: 32, height: 32, background: '#f8fafc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {t.emoji}
          </div>
          {editingId === t.id ? (
            <input
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRename(t.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              style={{ flex: 1, border: '1px solid #2563eb', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
            />
          ) : (
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{t.label}</div>
          )}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.colorHex, flexShrink: 0 }} />
          {t.isSystem && (
            <div style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
              sistema
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { setEditingId(t.id); setEditLabel(t.label); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px 6px', borderRadius: 6 }}
            >
              ✏️
            </button>
            {!t.isSystem && (
              <button
                onClick={() => void handleDelete(t.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px 6px', borderRadius: 6 }}
              >
                🗑
              </button>
            )}
          </div>
        </div>
      ))}

      {adding ? (
        <div style={{ padding: '12px 16px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              maxLength={2}
              style={{ width: 44, border: '1px solid #e2e8f0', borderRadius: 8, padding: 7, textAlign: 'center', fontSize: 18 }}
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nome tipo..."
              style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {SWATCHES.map((c) => (
              <div
                key={c}
                onClick={() => setNewColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                  boxShadow: newColor === c ? '0 0 0 2px #fff, 0 0 0 4px #2563eb' : 'none',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setAdding(false)}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Annulla
            </button>
            <button
              onClick={() => void handleAdd()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              Aggiungi
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setAdding(true)}
            style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 700, color: '#2563eb', cursor: 'pointer' }}
          >
            + Aggiungi tipo personalizzato
          </button>
        </div>
      )}
    </div>
  );
}
