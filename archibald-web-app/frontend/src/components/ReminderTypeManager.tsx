import React from 'react';
import type { ReminderTypeRecord, CreateReminderTypeInput } from '../services/reminders.service';
import { createReminderType, updateReminderType, deleteReminderType } from '../services/reminders.service';

type ReminderTypeManagerProps = {
  types: ReminderTypeRecord[];
  onTypesChange: (types: ReminderTypeRecord[]) => void;
};

type EditState = {
  id: number;
  label: string;
  emoji: string;
  quickEmoji: string;
  customEmoji: string;
  colorBg: string;
  colorText: string;
};

const QUICK_EMOJIS = ['📞', '🔥', '💰', '🔄', '🎂', '📋', '🎯', '🤝'];

const COLOR_PRESETS: Array<{ bg: string; text: string }> = [
  { bg: '#fee2e2', text: '#dc2626' },
  { bg: '#fef9c3', text: '#92400e' },
  { bg: '#f0fdf4', text: '#15803d' },
  { bg: '#eff6ff', text: '#1d4ed8' },
  { bg: '#fdf4ff', text: '#7e22ce' },
  { bg: '#fff7ed', text: '#c2410c' },
  { bg: '#f0f9ff', text: '#0369a1' },
];

const DEFAULT_EMOJI = '📋';
const DEFAULT_COLOR = COLOR_PRESETS[0];

export function ReminderTypeManager({ types, onTypesChange }: ReminderTypeManagerProps) {
  const [editState, setEditState] = React.useState<EditState | null>(null);
  const [showNewForm, setShowNewForm] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');
  const [newQuickEmoji, setNewQuickEmoji] = React.useState(DEFAULT_EMOJI);
  const [newCustomEmoji, setNewCustomEmoji] = React.useState('');
  const [newColor, setNewColor] = React.useState(DEFAULT_COLOR);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [deleteUsages, setDeleteUsages] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);

  const activeNewEmoji = newCustomEmoji.trim() || newQuickEmoji;

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setSaving(true);
    try {
      const input: CreateReminderTypeInput = {
        label: newLabel.trim(),
        emoji: activeNewEmoji,
        colorBg: newColor.bg,
        colorText: newColor.text,
      };
      const created = await createReminderType(input);
      onTypesChange([...types, created]);
      setShowNewForm(false);
      setNewLabel('');
      setNewQuickEmoji(DEFAULT_EMOJI);
      setNewCustomEmoji('');
      setNewColor(DEFAULT_COLOR);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editState || !editState.label.trim()) return;
    setSaving(true);
    try {
      const activeEmoji = editState.customEmoji.trim() || editState.quickEmoji;
      const updated = await updateReminderType(editState.id, {
        label: editState.label.trim(),
        emoji: activeEmoji,
        colorBg: editState.colorBg,
        colorText: editState.colorText,
      });
      onTypesChange(types.map((t) => (t.id === updated.id ? updated : t)));
      setEditState(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setSaving(true);
    try {
      const { usages } = await deleteReminderType(id);
      if (usages > 0) {
        setDeleteUsages(usages);
        return;
      }
      onTypesChange(types.filter((t) => t.id !== id));
      setDeletingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm(id: number) {
    setSaving(true);
    try {
      await deleteReminderType(id);
      onTypesChange(types.filter((t) => t.id !== id));
      setDeletingId(null);
      setDeleteUsages(null);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(t: ReminderTypeRecord) {
    setEditState({
      id: t.id,
      label: t.label,
      emoji: t.emoji,
      quickEmoji: QUICK_EMOJIS.includes(t.emoji) ? t.emoji : DEFAULT_EMOJI,
      customEmoji: QUICK_EMOJIS.includes(t.emoji) ? '' : t.emoji,
      colorBg: t.colorBg,
      colorText: t.colorText,
    });
    setShowNewForm(false);
  }

  const panelStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
    marginBottom: '10px', overflow: 'hidden',
  };
  const headerStyle: React.CSSProperties = {
    padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: '8px', alignItems: 'center',
    padding: '7px 12px', borderBottom: '1px solid #f8fafc',
  };
  const iconBtnBase: React.CSSProperties = {
    width: '24px', height: '24px', border: '1px solid #e2e8f0',
    borderRadius: '5px', background: '#f8fafc', cursor: 'pointer',
    fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a' }}>{'⚙'} Gestisci tipi</span>
        <button
          onClick={() => { setShowNewForm(!showNewForm); setEditState(null); }}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Aggiungi
        </button>
      </div>

      {types.map((t) => (
        <React.Fragment key={t.id}>
          <div style={rowStyle}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', flex: 1, background: t.colorBg, color: t.colorText }}>
              <span>{t.emoji}</span>{' '}<span>{t.label}</span>
              {t.deletedAt && <span style={{ marginLeft: '6px', opacity: 0.6 }}>(eliminato)</span>}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => startEdit(t)}
                title="Modifica tipo"
                style={{ ...iconBtnBase, borderColor: '#bfdbfe', background: '#eff6ff', color: '#2563eb' }}
              >{'✎'}</button>
              <button
                onClick={() => { setDeletingId(t.id); setDeleteUsages(null); }}
                title="Elimina tipo"
                style={{ ...iconBtnBase, borderColor: '#fca5a5', background: '#fef2f2', color: '#dc2626' }}
              >{'✕'}</button>
            </div>
          </div>

          {editState?.id === t.id && (
            <TypeForm
              label={editState.label}
              quickEmoji={editState.quickEmoji}
              customEmoji={editState.customEmoji}
              colorBg={editState.colorBg}
              colorText={editState.colorText}
              saving={saving}
              onLabelChange={(v) => setEditState((s) => s && { ...s, label: v })}
              onQuickEmojiChange={(e) => setEditState((s) => s && { ...s, quickEmoji: e, customEmoji: '' })}
              onCustomEmojiChange={(e) => setEditState((s) => s && { ...s, customEmoji: e, quickEmoji: '' })}
              onColorChange={(bg, text) => setEditState((s) => s && { ...s, colorBg: bg, colorText: text })}
              onSave={() => { void handleUpdate(); }}
              onCancel={() => setEditState(null)}
            />
          )}

          {deletingId === t.id && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
              <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '4px' }}>
                {`Eliminare "${t.label}"?`}
              </div>
              {deleteUsages !== null && deleteUsages > 0 && (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                  {`⚠ ${deleteUsages} promemori${deleteUsages === 1 ? 'o attivo' : 'a attivi'} con questo tipo — verranno mostrati come "Tipo eliminato".`}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => { void (deleteUsages !== null ? handleDeleteConfirm(t.id) : handleDelete(t.id)); }}
                  disabled={saving}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '5px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Conferma eliminazione
                </button>
                <button
                  onClick={() => { setDeletingId(null); setDeleteUsages(null); }}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '5px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </React.Fragment>
      ))}

      {showNewForm && (
        <TypeForm
          label={newLabel}
          quickEmoji={newQuickEmoji}
          customEmoji={newCustomEmoji}
          colorBg={newColor.bg}
          colorText={newColor.text}
          saving={saving}
          onLabelChange={setNewLabel}
          onQuickEmojiChange={(e) => { setNewQuickEmoji(e); setNewCustomEmoji(''); }}
          onCustomEmojiChange={(e) => { setNewCustomEmoji(e); setNewQuickEmoji(''); }}
          onColorChange={(bg, text) => setNewColor({ bg, text })}
          onSave={() => { void handleCreate(); }}
          onCancel={() => { setShowNewForm(false); setNewLabel(''); }}
        />
      )}
    </div>
  );
}

type TypeFormProps = {
  label: string;
  quickEmoji: string;
  customEmoji: string;
  colorBg: string;
  colorText: string;
  saving: boolean;
  onLabelChange: (v: string) => void;
  onQuickEmojiChange: (e: string) => void;
  onCustomEmojiChange: (e: string) => void;
  onColorChange: (bg: string, text: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function TypeForm({
  label, quickEmoji, customEmoji, colorBg, colorText, saving,
  onLabelChange, onQuickEmojiChange, onCustomEmojiChange, onColorChange,
  onSave, onCancel,
}: TypeFormProps) {
  const formStyle: React.CSSProperties = {
    padding: '10px 12px', borderTop: '1px solid #f1f5f9', background: '#f0f9ff',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '.5px', display: 'block', marginBottom: '4px',
  };

  return (
    <div style={formStyle}>
      <label style={labelStyle}>Nome</label>
      <input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder="Nome tipo..."
        style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', marginBottom: '8px', boxSizing: 'border-box' }}
      />

      <label style={labelStyle}>Emoji</label>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' }}>
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onQuickEmojiChange(e)}
            style={{
              width: '28px', height: '28px',
              border: customEmoji ? '1px solid #e2e8f0' : (quickEmoji === e ? '2px solid #2563eb' : '1px solid #e2e8f0'),
              borderRadius: '6px',
              background: (!customEmoji && quickEmoji === e) ? '#eff6ff' : '#fff',
              cursor: 'pointer', fontSize: '14px',
            }}
          >
            {e}
          </button>
        ))}
        <input
          value={customEmoji}
          onChange={(e) => {
            const val = [...e.target.value].slice(0, 2).join('');
            onCustomEmojiChange(val);
          }}
          placeholder="✏️"
          maxLength={4}
          style={{
            width: '50px', height: '28px',
            border: customEmoji ? '2px solid #2563eb' : '1px solid #e2e8f0',
            borderRadius: '6px',
            background: customEmoji ? '#eff6ff' : '#fff',
            fontSize: '14px', textAlign: 'center', padding: '0 4px',
          }}
        />
      </div>

      <label style={{ ...labelStyle, marginTop: '6px' }}>Colore</label>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {COLOR_PRESETS.map((c) => (
          <div
            key={c.bg}
            onClick={() => onColorChange(c.bg, c.text)}
            style={{
              width: '22px', height: '22px', borderRadius: '50%', background: c.bg,
              cursor: 'pointer',
              border: colorBg === c.bg ? `3px solid ${c.text}` : '2px solid transparent',
            }}
          />
        ))}
        <div style={{ fontSize: '11px', padding: '3px 6px', borderRadius: '8px', background: colorBg, color: colorText, fontWeight: 700, alignSelf: 'center' }}>
          Anteprima
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button
          onClick={onSave}
          disabled={saving || !label.trim()}
          style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
        >
          Salva
        </button>
        <button
          onClick={onCancel}
          style={{ background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer' }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
