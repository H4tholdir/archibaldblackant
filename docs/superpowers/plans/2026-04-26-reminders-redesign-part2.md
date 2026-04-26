# Reminders Redesign — Implementation Plan (Part 2: Componenti UI + Pagine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisito:** Part 1 (`2026-04-26-reminders-redesign-part1.md`) deve essere completata prima di iniziare.

**Goal:** Implementare tutti i componenti UI: gestore tipi inline, form aggiornato, widget settimanale con azioni, pagina /agenda, e voce navbar.

**Tech Stack:** React 19, TypeScript strict, inline styles, Vitest + Testing Library.

---

## File Map (Part 2)

| Azione | File |
|---|---|
| Create | `archibald-web-app/frontend/src/components/ReminderTypeManager.tsx` |
| Create | `archibald-web-app/frontend/src/components/ReminderTypeManager.spec.tsx` |
| Modify | `archibald-web-app/frontend/src/components/ReminderForm.tsx` |
| Create | `archibald-web-app/frontend/src/components/ReminderForm.spec.tsx` |
| Modify | `archibald-web-app/frontend/src/components/CustomerRemindersSection.tsx` |
| Modify | `archibald-web-app/frontend/src/components/RemindersWidgetNew.tsx` |
| Create | `archibald-web-app/frontend/src/pages/AgendaPage.tsx` |
| Create | `archibald-web-app/frontend/src/pages/AgendaPage.spec.tsx` |
| Modify | `archibald-web-app/frontend/src/components/DashboardNav.tsx` |
| Modify | `archibald-web-app/frontend/src/AppRouter.tsx` |

---

## Task 6: Nuovo componente `ReminderTypeManager.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/components/ReminderTypeManager.tsx`
- Create: `archibald-web-app/frontend/src/components/ReminderTypeManager.spec.tsx`

- [ ] **Step 1: Scrivere il test (failing)**

Crea `archibald-web-app/frontend/src/components/ReminderTypeManager.spec.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReminderTypeManager } from './ReminderTypeManager';
import * as service from '../services/reminders.service';
import type { ReminderTypeRecord } from '../services/reminders.service';

const TYPES: ReminderTypeRecord[] = [
  { id: 1, label: 'Ricontatto commerciale', emoji: '📞', colorBg: '#fee2e2', colorText: '#dc2626', sortOrder: 1, deletedAt: null },
  { id: 2, label: 'Follow-up offerta', emoji: '🔥', colorBg: '#fef9c3', colorText: '#92400e', sortOrder: 2, deletedAt: null },
];

describe('ReminderTypeManager', () => {
  let onTypesChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTypesChange = vi.fn();
    vi.spyOn(service, 'createReminderType').mockResolvedValue({
      id: 99, label: 'Nuovo', emoji: '🎯', colorBg: '#fff7ed', colorText: '#c2410c', sortOrder: 3, deletedAt: null,
    });
    vi.spyOn(service, 'updateReminderType').mockResolvedValue({
      ...TYPES[0], label: 'Aggiornato',
    });
    vi.spyOn(service, 'deleteReminderType').mockResolvedValue({ usages: 0 });
  });

  test('mostra tutti i tipi nella lista', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    expect(screen.getByText('Ricontatto commerciale')).toBeInTheDocument();
    expect(screen.getByText('Follow-up offerta')).toBeInTheDocument();
  });

  test('click + Aggiungi mostra il form nuovo tipo', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    expect(screen.getByPlaceholderText('Nome tipo...')).toBeInTheDocument();
  });

  test('salva nuovo tipo e chiama onTypesChange', async () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    fireEvent.change(screen.getByPlaceholderText('Nome tipo...'), { target: { value: 'Nuovo' } });
    fireEvent.click(screen.getByText('Salva'));
    await waitFor(() => expect(service.createReminderType).toHaveBeenCalledWith({
      label: 'Nuovo', emoji: expect.any(String), colorBg: expect.any(String), colorText: expect.any(String),
    }));
    expect(onTypesChange).toHaveBeenCalled();
  });

  test('quick-pick emoji aggiorna la selezione', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getByText('+ Aggiungi'));
    const emojiButtons = screen.getAllByRole('button', { name: '🎯' });
    fireEvent.click(emojiButtons[0]);
    // l'emoji custom input è vuoto dopo la selezione quick-pick
    const customInput = screen.getByPlaceholderText('✏️');
    expect((customInput as HTMLInputElement).value).toBe('');
  });

  test('click ✕ su tipo mostra confirm inline', () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    const deleteButtons = screen.getAllByTitle('Elimina tipo');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText(/Eliminare/)).toBeInTheDocument();
    expect(screen.getByText('Conferma eliminazione')).toBeInTheDocument();
  });

  test('conferma eliminazione chiama deleteReminderType e onTypesChange', async () => {
    render(<ReminderTypeManager types={TYPES} onTypesChange={onTypesChange} />);
    fireEvent.click(screen.getAllByTitle('Elimina tipo')[0]);
    fireEvent.click(screen.getByText('Conferma eliminazione'));
    await waitFor(() => expect(service.deleteReminderType).toHaveBeenCalledWith(1));
    expect(onTypesChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire — verificare che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- ReminderTypeManager.spec
```
Atteso: `Cannot find module './ReminderTypeManager'`.

- [ ] **Step 3: Implementare `ReminderTypeManager.tsx`**

Crea `archibald-web-app/frontend/src/components/ReminderTypeManager.tsx`:

```tsx
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
  colorBg: string;
  colorText: string;
  quickEmoji: string;
  customEmoji: string;
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
        <span style={{ fontWeight: 700, fontSize: '12px', color: '#0f172a' }}>⚙ Gestisci tipi</span>
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
              {t.emoji} {t.label}
              {t.deletedAt && <span style={{ marginLeft: '6px', opacity: 0.6 }}>(eliminato)</span>}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => startEdit(t)}
                title="Modifica tipo"
                style={{ ...iconBtnBase, borderColor: '#bfdbfe', background: '#eff6ff', color: '#2563eb' }}
              >✎</button>
              <button
                onClick={() => { setDeletingId(t.id); setDeleteUsages(null); }}
                title="Elimina tipo"
                style={{ ...iconBtnBase, borderColor: '#fca5a5', background: '#fef2f2', color: '#dc2626' }}
              >✕</button>
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
                Eliminare &ldquo;{t.label}&rdquo;?
              </div>
              {deleteUsages !== null && deleteUsages > 0 && (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
                  ⚠ {deleteUsages} promemori{deleteUsages === 1 ? 'o attivo' : 'a attivi'} con questo tipo — verranno mostrati come &ldquo;Tipo eliminato&rdquo;.
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
              width: '28px', height: '28px', border: customEmoji ? '1px solid #e2e8f0' : (quickEmoji === e ? '2px solid #2563eb' : '1px solid #e2e8f0'),
              borderRadius: '6px', background: (!customEmoji && quickEmoji === e) ? '#eff6ff' : '#fff',
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
            width: '50px', height: '28px', border: customEmoji ? '2px solid #2563eb' : '1px solid #e2e8f0',
            borderRadius: '6px', background: customEmoji ? '#eff6ff' : '#fff',
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
              cursor: 'pointer', border: colorBg === c.bg ? `3px solid ${c.text}` : '2px solid transparent',
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
```

- [ ] **Step 4: Eseguire il test — verificare che passi**

```bash
npm test --prefix archibald-web-app/frontend -- ReminderTypeManager.spec
```
Atteso: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/components/ReminderTypeManager.tsx \
        archibald-web-app/frontend/src/components/ReminderTypeManager.spec.tsx
git commit -m "feat(frontend): componente ReminderTypeManager con CRUD tipi inline"
```

---

## Task 7: Aggiornare `ReminderForm.tsx` e `CustomerRemindersSection.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/ReminderForm.tsx`
- Create: `archibald-web-app/frontend/src/components/ReminderForm.spec.tsx`
- Modify: `archibald-web-app/frontend/src/components/CustomerRemindersSection.tsx`

- [ ] **Step 1: Scrivere il test per ReminderForm (failing)**

Crea `archibald-web-app/frontend/src/components/ReminderForm.spec.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReminderForm } from './ReminderForm';
import * as service from '../services/reminders.service';
import type { ReminderTypeRecord, CreateReminderInput } from '../services/reminders.service';

const TYPES: ReminderTypeRecord[] = [
  { id: 1, label: 'Ricontatto commerciale', emoji: '📞', colorBg: '#fee2e2', colorText: '#dc2626', sortOrder: 1, deletedAt: null },
  { id: 2, label: 'Follow-up offerta', emoji: '🔥', colorBg: '#fef9c3', colorText: '#92400e', sortOrder: 2, deletedAt: null },
];

describe('ReminderForm', () => {
  beforeEach(() => {
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue(TYPES);
  });

  test('carica i tipi dal servizio al mount', async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    expect(await screen.findByText('📞 Ricontatto commerciale')).toBeInTheDocument();
  });

  test("il chip 'Oggi' imposta la data odierna", async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Oggi'));
    const today = new Date().toISOString().split('T')[0];
    const input = screen.getByDisplayValue(today) as HTMLInputElement;
    expect(input.value).toBe(today);
  });

  test('la data di default è oggi', async () => {
    render(<ReminderForm customerProfile="CUST-001" onSave={vi.fn()} onCancel={vi.fn()} />);
    const today = new Date().toISOString().split('T')[0];
    const input = await screen.findByDisplayValue(today) as HTMLInputElement;
    expect(input.value).toBe(today);
  });

  test('onSave riceve type_id (non type stringa)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ReminderForm customerProfile="CUST-001" onSave={onSave} onCancel={vi.fn()} />);
    await waitFor(() => expect(service.listReminderTypes).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByText('Salva promemoria'));
    });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const input: CreateReminderInput = onSave.mock.calls[0][0];
    expect(typeof input.type_id).toBe('number');
    expect('type' in input).toBe(false);
  });

  test('tipo eliminato mostra banner warning', async () => {
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue(TYPES);
    render(
      <ReminderForm
        customerProfile="CUST-001"
        initial={{
          id: 5, typeId: 99, typeLabel: 'Vecchio', typeEmoji: '❓',
          typeColorBg: '#f1f5f9', typeColorText: '#64748b', typeDeletedAt: '2026-01-01',
          priority: 'normal', dueAt: new Date().toISOString(),
          recurrenceDays: null, note: null, notifyVia: 'app',
          status: 'active', snoozedUntil: null, completedAt: null,
          completionNote: null, createdAt: '', updatedAt: '', userId: '', customerErpId: '',
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Tipo precedente eliminato/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Eseguire — verificare che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- ReminderForm.spec
```
Atteso: vari FAIL (form usa ancora type stringa, default è domani, ecc.).

- [ ] **Step 3: Riscrivere `ReminderForm.tsx`**

```tsx
import React from 'react';
import type { Reminder, CreateReminderInput, ReminderPriority, ReminderTypeRecord } from '../services/reminders.service';
import {
  REMINDER_PRIORITY_LABELS, REMINDER_PRIORITY_COLORS, RECURRENCE_OPTIONS,
  computeDueDateFromChip, listReminderTypes,
} from '../services/reminders.service';
import { ReminderTypeManager } from './ReminderTypeManager';

type ReminderFormProps = {
  customerProfile: string;
  initial?: Partial<Reminder>;
  onSave: (input: CreateReminderInput) => Promise<void>;
  onCancel: () => void;
};

const DATE_CHIPS = ['Oggi', 'Domani', '3 giorni', '1 settimana', '2 settimane', '1 mese', '3 mesi'];

export function ReminderForm({ customerProfile: _customerProfile, initial, onSave, onCancel }: ReminderFormProps) {
  const [types, setTypes] = React.useState<ReminderTypeRecord[]>([]);
  const [typeId, setTypeId] = React.useState<number>(initial?.typeId ?? 0);
  const [showTypeManager, setShowTypeManager] = React.useState(false);
  const [priority, setPriority] = React.useState<ReminderPriority>(initial?.priority ?? 'normal');
  const [dueAt, setDueAt] = React.useState(
    initial?.dueAt ? initial.dueAt.split('T')[0] : new Date().toISOString().split('T')[0],
  );
  const [recurrenceDays, setRecurrenceDays] = React.useState<number | null>(initial?.recurrenceDays ?? null);
  const [notifyVia, setNotifyVia] = React.useState<'app' | 'email'>(initial?.notifyVia ?? 'app');
  const [note, setNote] = React.useState(initial?.note ?? '');
  const [saving, setSaving] = React.useState(false);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);

  const deletedTypeInEdit = initial?.typeDeletedAt !== null && initial?.typeDeletedAt !== undefined;

  React.useEffect(() => {
    listReminderTypes().then((loaded) => {
      setTypes(loaded);
      const activeTypes = loaded.filter((t) => t.deletedAt === null);
      if (typeId === 0 || deletedTypeInEdit) {
        setTypeId(activeTypes[0]?.id ?? 0);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChip(chip: string) {
    setActiveChip(chip);
    setDueAt(computeDueDateFromChip(chip).split('T')[0]);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await onSave({
        type_id: typeId,
        priority,
        due_at: new Date(dueAt + 'T09:00:00').toISOString(),
        recurrence_days: recurrenceDays,
        note: note.trim() || null,
        notify_via: notifyVia,
      });
    } finally {
      setSaving(false);
    }
  }

  const activeTypes = types.filter((t) => t.deletedAt === null);

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
      {deletedTypeInEdit && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '12px', color: '#c2410c' }}>
          ⚠ Tipo precedente eliminato — scegli un tipo attivo prima di salvare.
        </div>
      )}

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>
          Tipo di contatto
        </label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={typeId}
            onChange={(e) => setTypeId(Number(e.target.value))}
            style={{ flex: 1, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
          >
            {activeTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowTypeManager(!showTypeManager)}
            title="Gestisci tipi"
            style={{ width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '6px', background: showTypeManager ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}
          >⚙</button>
        </div>
      </div>

      {showTypeManager && (
        <ReminderTypeManager
          types={types}
          onTypesChange={(updated) => {
            setTypes(updated);
            const activeAfter = updated.filter((t) => t.deletedAt === null);
            if (!activeAfter.find((t) => t.id === typeId)) {
              setTypeId(activeAfter[0]?.id ?? 0);
            }
          }}
        />
      )}

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Priorità</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['urgent', 'normal', 'low'] as ReminderPriority[]).map((p) => {
            const colors = REMINDER_PRIORITY_COLORS[p];
            const selected = priority === p;
            return (
              <button key={p} onClick={() => setPriority(p)} style={{
                padding: '4px 10px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px',
                fontWeight: selected ? 700 : 400,
                border: selected ? `2px solid ${colors.text}` : '1px solid #e2e8f0',
                background: selected ? colors.bg : '#fff', color: selected ? colors.text : '#64748b',
              }}>{REMINDER_PRIORITY_LABELS[p]}</button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Quando</label>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
          {DATE_CHIPS.map((chip) => (
            <button key={chip} onClick={() => handleChip(chip)} style={{
              padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px',
              border: activeChip === chip ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: activeChip === chip ? '#eff6ff' : '#fff',
              color: activeChip === chip ? '#1d4ed8' : '#64748b',
            }}>{chip}</button>
          ))}
          <button onClick={() => setActiveChip('custom')} style={{ padding: '3px 8px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>📅 Data…</button>
        </div>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => { setDueAt(e.target.value); setActiveChip('custom'); }}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '4px' }}>Ripetizione</label>
        <select value={recurrenceDays ?? 'null'} onChange={(e) => setRecurrenceDays(e.target.value === 'null' ? null : Number(e.target.value))}
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff' }}>
          {RECURRENCE_OPTIONS.map(({ label, days }) => (
            <option key={String(days)} value={String(days)}>{label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['app', 'email'] as const).map((v) => (
            <button key={v} onClick={() => setNotifyVia(v)} style={{
              padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
              border: notifyVia === v ? '2px solid #2563eb' : '1px solid #e2e8f0',
              background: notifyVia === v ? '#eff6ff' : '#fff',
              color: notifyVia === v ? '#1d4ed8' : '#64748b',
            }}>{v === 'app' ? '📱 App' : '📧 Email'}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <textarea value={note ?? ''} onChange={(e) => setNote(e.target.value)}
          placeholder="Es: proporre preventivo trattamento X..."
          rows={2}
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none' }} />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => { void handleSubmit(); }} disabled={saving || typeId === 0} style={{ flex: 1, padding: '8px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontSize: '13px' }}>
          {saving ? 'Salvataggio...' : 'Salva promemoria'}
        </button>
        <button onClick={onCancel} style={{ padding: '8px 14px', background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>Annulla</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Aggiornare `CustomerRemindersSection.tsx`**

Sostituisci le righe di import e i riferimenti a `r.type` / `REMINDER_TYPE_LABELS` / `REMINDER_TYPE_COLORS`:

**Import da rimuovere:**
```ts
// Rimuovi: REMINDER_TYPE_LABELS, REMINDER_TYPE_COLORS
```

**Import aggiornato:**
```ts
import {
  listCustomerReminders, createReminder, patchReminder, deleteReminder,
  REMINDER_PRIORITY_COLORS, REMINDER_PRIORITY_LABELS, formatDueAt,
} from '../services/reminders.service';
import type { Reminder, CreateReminderInput } from '../services/reminders.service';
```

**Nel render di ogni reminder**, sostituisci:
```ts
// PRIMA:
const typeColors = REMINDER_TYPE_COLORS[r.type] ?? { bg: '#f1f5f9', text: '#64748b' };
// ...
{REMINDER_TYPE_LABELS[r.type] ?? r.type}

// DOPO:
const typeColors = { bg: r.typeColorBg, text: r.typeColorText };
// ...
{r.typeEmoji} {r.typeLabel}
{r.typeDeletedAt && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#94a3b8' }}>(eliminato)</span>}
```

- [ ] **Step 5: Eseguire i test**

```bash
npm test --prefix archibald-web-app/frontend -- ReminderForm.spec
```
Atteso: 5 tests PASS.

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori (tranne eventualmente RemindersWidgetNew che viene riscritto al Task 8).

- [ ] **Step 6: Commit**

```bash
git add archibald-web-app/frontend/src/components/ReminderForm.tsx \
        archibald-web-app/frontend/src/components/ReminderForm.spec.tsx \
        archibald-web-app/frontend/src/components/CustomerRemindersSection.tsx
git commit -m "feat(frontend): ReminderForm con tipi dinamici, chip Oggi, type manager inline"
```

---

## Task 8: Redesign `RemindersWidgetNew.tsx`

**Files:**
- Modify: `archibald-web-app/frontend/src/components/RemindersWidgetNew.tsx`

Il widget viene riscritto completamente: strip settimanale lun-dom, dot colorati per tipo, sezione scaduti sempre visibile, azioni inline complete.

- [ ] **Step 1: Riscrivere `RemindersWidgetNew.tsx`**

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listUpcomingReminders, patchReminder, deleteReminder, formatDueAt,
} from '../services/reminders.service';
import type { ReminderWithCustomer, UpcomingReminders, CreateReminderInput } from '../services/reminders.service';
import { ReminderForm } from './ReminderForm';

const DAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const TODAY_STR = new Date().toISOString().split('T')[0];

function getWeekDays(ref: Date): Date[] {
  const dow = ref.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function RemindersWidgetNew() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<UpcomingReminders | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedDay, setSelectedDay] = React.useState(TODAY_STR);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const today = new Date();
  const weekDays = getWeekDays(today);

  async function loadData() {
    setLoading(true);
    try {
      const d = await listUpcomingReminders(14);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void loadData(); }, []);

  async function handleComplete(r: ReminderWithCustomer) {
    await patchReminder(r.id, { status: 'done', completed_at: new Date().toISOString() });
    void loadData();
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();
    await patchReminder(r.id, { status: 'snoozed', snoozed_until: snoozedUntil });
    void loadData();
  }

  async function handleDelete(id: number) {
    await deleteReminder(id);
    setDeletingId(null);
    void loadData();
  }

  async function handleEdit(r: ReminderWithCustomer, input: CreateReminderInput) {
    await patchReminder(r.id, {
      type_id: input.type_id,
      priority: input.priority,
      due_at: input.due_at,
      recurrence_days: input.recurrence_days,
      note: input.note ?? undefined,
      notify_via: input.notify_via,
    });
    setEditingId(null);
    void loadData();
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
        Caricamento promemoria...
      </div>
    );
  }

  if (!data) return null;

  const overdueCount = data.overdue.length;
  const selectedList = data.byDate[selectedDay] ?? [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header — clickable → /agenda */}
      <div
        onClick={() => navigate('/agenda')}
        style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔔</span>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>Promemoria</span>
          {overdueCount > 0 && (
            <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
              {overdueCount} scadut{overdueCount === 1 ? 'o' : 'i'}
            </span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>→ Agenda</span>
      </div>

      {/* Strip settimanale */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '8px 10px', gap: '4px' }}>
        {weekDays.map((day, i) => {
          const ds = toDateStr(day);
          const isSelected = ds === selectedDay;
          const isToday = ds === TODAY_STR;
          const dayReminders = data.byDate[ds] ?? [];
          const dots = dayReminders.slice(0, 4).map((r) => r.typeColorText);

          return (
            <div
              key={ds}
              onClick={() => setSelectedDay(ds)}
              style={{
                flex: 1, textAlign: 'center', cursor: 'pointer', borderRadius: '8px',
                padding: '4px 2px', background: isSelected ? '#2563eb' : isToday ? '#eff6ff' : 'transparent',
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 600, color: isSelected ? '#fff' : '#94a3b8', marginBottom: '1px' }}>
                {DAY_LABELS[i]}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? '#fff' : isToday ? '#2563eb' : '#0f172a' }}>
                {day.getDate()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: '2px', minHeight: '6px' }}>
                {dots.map((color, di) => (
                  <div key={di} style={{ width: '5px', height: '5px', borderRadius: '50%', background: isSelected ? '#fff' : color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sezione scaduti (sempre visibile se presenti) */}
      {overdueCount > 0 && (
        <div style={{ borderBottom: '1px solid #f1f5f9', padding: '8px 14px 4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>
            ⚠ Scaduti ({overdueCount})
          </div>
          {data.overdue.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              editingId={editingId}
              deletingId={deletingId}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onEdit={(r, input) => handleEdit(r, input)}
              onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
              onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
              onDeleteConfirm={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Lista giorno selezionato */}
      <div style={{ padding: '8px 14px' }}>
        {selectedList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '12px' }}>
            Nessun promemoria per questo giorno
          </div>
        ) : (
          selectedList.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              editingId={editingId}
              deletingId={deletingId}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onEdit={(r, input) => handleEdit(r, input)}
              onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
              onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
              onDeleteConfirm={handleDelete}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        {data.completedToday > 0
          ? `✓ ${data.completedToday} completat${data.completedToday === 1 ? 'o' : 'i'} oggi`
          : `${data.totalActive} attivi`}
      </div>
    </div>
  );
}

type ReminderCardProps = {
  r: ReminderWithCustomer;
  editingId: number | null;
  deletingId: number | null;
  onComplete: (r: ReminderWithCustomer) => Promise<void>;
  onSnooze: (r: ReminderWithCustomer, days: number) => Promise<void>;
  onEdit: (r: ReminderWithCustomer, input: CreateReminderInput) => Promise<void>;
  onEditToggle: (id: number) => void;
  onDeleteToggle: (id: number) => void;
  onDeleteConfirm: (id: number) => Promise<void>;
};

function ReminderCard({
  r, editingId, deletingId,
  onComplete, onSnooze, onEdit, onEditToggle, onDeleteToggle, onDeleteConfirm,
}: ReminderCardProps) {
  const { label: dueLabel, urgent } = formatDueAt(r.dueAt);
  const navigate = useNavigate();

  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.typeColorText, marginTop: '5px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, background: r.typeColorBg, color: r.typeColorText, padding: '1px 6px', borderRadius: '8px' }}>
              {r.typeEmoji} {r.typeLabel}
            </span>
            <button
              onClick={() => navigate(`/customers/${encodeURIComponent(r.customerErpId)}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#2563eb', padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}
            >
              {r.customerName}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: urgent ? '#dc2626' : '#94a3b8', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
          {r.note && <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{r.note}"</div>}

          <div style={{ display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
            <button onClick={() => { void onComplete(r); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}>✓</button>
            <button onClick={() => onEditToggle(r.id)} style={{ background: editingId === r.id ? '#eff6ff' : '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>✎</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: deletingId === r.id ? '#fef2f2' : '#f8fafc', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
            <button onClick={() => { void onSnooze(r, 3); }} style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}>⏰+3gg</button>
          </div>
        </div>
      </div>

      {editingId === r.id && (
        <div style={{ marginTop: '8px' }}>
          <ReminderForm
            customerProfile={r.customerErpId}
            initial={r}
            onSave={(input) => onEdit(r, input)}
            onCancel={() => onEditToggle(r.id)}
          />
        </div>
      )}

      {deletingId === r.id && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '7px', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
          <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
            <button onClick={() => { void onDeleteConfirm(r.id); }} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Elimina</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check frontend**

```bash
npm run type-check --prefix archibald-web-app/frontend
```
Atteso: 0 errori.

- [ ] **Step 3: Commit**

```bash
git add archibald-web-app/frontend/src/components/RemindersWidgetNew.tsx
git commit -m "feat(frontend): RemindersWidgetNew — strip settimanale, dot colorati, azioni inline, header → /agenda"
```

---

## Task 9: Nuova pagina `AgendaPage.tsx`

**Files:**
- Create: `archibald-web-app/frontend/src/pages/AgendaPage.tsx`
- Create: `archibald-web-app/frontend/src/pages/AgendaPage.spec.tsx`

- [ ] **Step 1: Scrivere il test (failing)**

Crea `archibald-web-app/frontend/src/pages/AgendaPage.spec.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgendaPage } from './AgendaPage';
import * as service from '../services/reminders.service';
import type { UpcomingReminders } from '../services/reminders.service';

const TODAY = new Date().toISOString().split('T')[0];

const MOCK_DATA: UpcomingReminders = {
  overdue: [
    {
      id: 1, customerErpId: 'CUST-001', customerName: 'Studio Bianchi',
      typeId: 1, typeLabel: 'Ricontatto', typeEmoji: '📞',
      typeColorBg: '#fee2e2', typeColorText: '#dc2626', typeDeletedAt: null,
      priority: 'urgent', dueAt: '2026-04-20T09:00:00Z',
      recurrenceDays: null, note: null, notifyVia: 'app',
      status: 'active', snoozedUntil: null, completedAt: null,
      completionNote: null, createdAt: '', updatedAt: '', userId: '',
    },
  ],
  byDate: {
    [TODAY]: [
      {
        id: 2, customerErpId: 'CUST-002', customerName: 'Rossi Dental',
        typeId: 2, typeLabel: 'Follow-up', typeEmoji: '🔥',
        typeColorBg: '#fef9c3', typeColorText: '#92400e', typeDeletedAt: null,
        priority: 'normal', dueAt: `${TODAY}T09:00:00Z`,
        recurrenceDays: null, note: 'verifica offerta', notifyVia: 'app',
        status: 'active', snoozedUntil: null, completedAt: null,
        completionNote: null, createdAt: '', updatedAt: '', userId: '',
      },
    ],
  },
  totalActive: 2,
  completedToday: 1,
};

describe('AgendaPage', () => {
  beforeEach(() => {
    vi.spyOn(service, 'listUpcomingReminders').mockResolvedValue(MOCK_DATA);
    vi.spyOn(service, 'listReminderTypes').mockResolvedValue([]);
  });

  test('mostra KPI row con conteggi', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Scaduti/)).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('mostra sezione scaduti', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    expect(await screen.findByText('Studio Bianchi')).toBeInTheDocument();
  });

  test('mostra sezione Oggi con reminder', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    expect(await screen.findByText('Rossi Dental')).toBeInTheDocument();
    expect(await screen.findByText('"verifica offerta"')).toBeInTheDocument();
  });

  test('calendario mensile mostra 7 intestazioni di colonna', async () => {
    render(<MemoryRouter><AgendaPage /></MemoryRouter>);
    await waitFor(() => expect(service.listUpcomingReminders).toHaveBeenCalledWith(31));
    const headers = screen.getAllByText(/^[LMMGVSD]$/);
    expect(headers).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Eseguire — verificare che fallisca**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaPage.spec
```
Atteso: `Cannot find module './AgendaPage'`.

- [ ] **Step 3: Implementare `AgendaPage.tsx`**

Crea `archibald-web-app/frontend/src/pages/AgendaPage.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listUpcomingReminders, patchReminder, deleteReminder, formatDueAt,
} from '../services/reminders.service';
import type { ReminderWithCustomer, UpcomingReminders, CreateReminderInput } from '../services/reminders.service';
import { ReminderForm } from '../components/ReminderForm';

const DAY_LABELS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }
function todayStr(): string { return toDateStr(new Date()); }

function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  return cells;
}

type KpiFilter = 'all' | 'overdue' | 'today' | 'upcoming';

export function AgendaPage() {
  const navigate = useNavigate();
  const [data, setData] = React.useState<UpcomingReminders | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [calMonth, setCalMonth] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [kpiFilter, setKpiFilter] = React.useState<KpiFilter>('all');
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  async function loadData() {
    try {
      const d = await listUpcomingReminders(31);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void loadData(); }, []);

  async function handleComplete(r: ReminderWithCustomer) {
    await patchReminder(r.id, { status: 'done', completed_at: new Date().toISOString() });
    void loadData();
  }

  async function handleSnooze(r: ReminderWithCustomer, days: number) {
    await patchReminder(r.id, { status: 'snoozed', snoozed_until: new Date(Date.now() + days * 86400000).toISOString() });
    void loadData();
  }

  async function handleEdit(r: ReminderWithCustomer, input: CreateReminderInput) {
    await patchReminder(r.id, {
      type_id: input.type_id, priority: input.priority, due_at: input.due_at,
      recurrence_days: input.recurrence_days, note: input.note ?? undefined, notify_via: input.notify_via,
    });
    setEditingId(null);
    void loadData();
  }

  async function handleDelete(id: number) {
    await deleteReminder(id);
    setDeletingId(null);
    void loadData();
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>Caricamento agenda...</div>
    );
  }

  if (!data) return null;

  const today = todayStr();
  const todayReminders = data.byDate[today] ?? [];
  const allByDate = Object.entries(data.byDate).sort(([a], [b]) => a.localeCompare(b));

  const overdueKpi = data.overdue.length;
  const todayKpi = todayReminders.length;
  const upcomingKpi = data.totalActive - data.overdue.length - todayKpi;

  // Filtra per KPI o per giorno selezionato nel calendario
  function getFilteredSections(): Array<{ key: string; label: string; reminders: ReminderWithCustomer[]; isOverdue?: boolean }> {
    if (selectedDay) {
      const dayReminders = data!.byDate[selectedDay] ?? [];
      const overdue = data!.overdue;
      const sections: ReturnType<typeof getFilteredSections> = [];
      if (overdue.length > 0) sections.push({ key: 'overdue', label: `⚠ Scaduti (${overdue.length})`, reminders: overdue, isOverdue: true });
      sections.push({ key: selectedDay, label: `📅 ${new Date(selectedDay + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`, reminders: dayReminders });
      return sections;
    }
    if (kpiFilter === 'overdue') return [{ key: 'overdue', label: `⚠ Scaduti (${overdueKpi})`, reminders: data.overdue, isOverdue: true }];
    if (kpiFilter === 'today') return [{ key: today, label: `📅 Oggi — ${todayKpi} promemorì`, reminders: todayReminders }];

    const sections: ReturnType<typeof getFilteredSections> = [];
    if (kpiFilter !== 'upcoming' && data.overdue.length > 0) {
      sections.push({ key: 'overdue', label: `⚠ Scaduti (${data.overdue.length})`, reminders: data.overdue, isOverdue: true });
    }
    for (const [dateStr, reminders] of allByDate) {
      if (kpiFilter === 'upcoming' && dateStr === today) continue;
      const isToday = dateStr === today;
      const label = isToday
        ? `📅 Oggi — ${new Date(dateStr + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`
        : `📅 ${new Date(dateStr + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}`;
      sections.push({ key: dateStr, label, reminders });
    }
    return sections;
  }

  const sections = getFilteredSections();
  const cells = buildMonthGrid(calMonth.getFullYear(), calMonth.getMonth());

  const miniCal = (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: isMobile ? '16px' : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
          {MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}
        </span>
        <button onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px' }}>
        {DAY_LABELS.map((l) => (
          <div key={l} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#94a3b8', padding: '4px 0' }}>{l}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const ds = toDateStr(cell);
          const hasDots = (data.byDate[ds]?.length ?? 0) > 0 || (ds < today && data.overdue.some(() => true));
          const isSelected = selectedDay === ds;
          const isToday = ds === today;
          return (
            <div
              key={ds}
              onClick={() => setSelectedDay(isSelected ? null : ds)}
              style={{
                textAlign: 'center', padding: '5px 2px', borderRadius: '6px', cursor: 'pointer',
                background: isSelected ? '#2563eb' : isToday ? '#eff6ff' : 'transparent',
                color: isSelected ? '#fff' : isToday ? '#2563eb' : '#0f172a',
                fontWeight: isToday || isSelected ? 700 : 400, fontSize: '12px',
              }}
            >
              {cell.getDate()}
              {hasDots && (
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: isSelected ? '#fff' : '#2563eb', margin: '1px auto 0' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const agenda = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        {([
          { key: 'overdue', label: 'Scaduti', count: overdueKpi, color: '#dc2626', bg: '#fef2f2' },
          { key: 'today', label: 'Oggi', count: todayKpi, color: '#2563eb', bg: '#eff6ff' },
          { key: 'upcoming', label: 'Prossimi', count: Math.max(0, upcomingKpi), color: '#15803d', bg: '#f0fdf4' },
        ] as const).map(({ key, label, count, color, bg }) => (
          <button
            key={key}
            onClick={() => { setKpiFilter(kpiFilter === key ? 'all' : key); setSelectedDay(null); }}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: '10px', border: kpiFilter === key ? `2px solid ${color}` : '1px solid #e2e8f0',
              background: kpiFilter === key ? bg : '#fff', cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, color }}>{count}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{label}</div>
          </button>
        ))}
      </div>

      {/* Sezioni cronologiche */}
      {sections.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: '13px' }}>
          ✓ Nessun promemoria in questo periodo
        </div>
      ) : (
        sections.map(({ key, label, reminders, isOverdue }) => (
          <div key={key} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: isOverdue ? '#dc2626' : '#0f172a', marginBottom: '6px', padding: '0 2px' }}>
              {label}
            </div>
            {reminders.map((r) => (
              <AgendaReminderCard
                key={r.id}
                r={r}
                editingId={editingId}
                deletingId={deletingId}
                onComplete={handleComplete}
                onSnooze={handleSnooze}
                onEdit={(r, input) => handleEdit(r, input)}
                onEditToggle={(id) => { setEditingId(editingId === id ? null : id); setDeletingId(null); }}
                onDeleteToggle={(id) => { setDeletingId(deletingId === id ? null : id); setEditingId(null); }}
                onDeleteConfirm={handleDelete}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{ padding: '16px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: 0 }}>📅 Agenda</h1>
        <button
          onClick={() => navigate('/customers')}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          + Promemoria
        </button>
      </div>

      {/* Layout responsive */}
      {isMobile ? (
        <div>
          {miniCal}
          {agenda}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ width: '280px', flexShrink: 0 }}>{miniCal}</div>
          {agenda}
        </div>
      )}
    </div>
  );
}

type AgendaCardProps = {
  r: ReminderWithCustomer;
  editingId: number | null;
  deletingId: number | null;
  onComplete: (r: ReminderWithCustomer) => Promise<void>;
  onSnooze: (r: ReminderWithCustomer, days: number) => Promise<void>;
  onEdit: (r: ReminderWithCustomer, input: CreateReminderInput) => Promise<void>;
  onEditToggle: (id: number) => void;
  onDeleteToggle: (id: number) => void;
  onDeleteConfirm: (id: number) => Promise<void>;
};

function AgendaReminderCard({
  r, editingId, deletingId,
  onComplete, onSnooze, onEdit, onEditToggle, onDeleteToggle, onDeleteConfirm,
}: AgendaCardProps) {
  const navigate = useNavigate();
  const { label: dueLabel, urgent } = formatDueAt(r.dueAt);

  return (
    <div style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.typeColorText, marginTop: '5px', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, background: r.typeColorBg, color: r.typeColorText, padding: '1px 7px', borderRadius: '10px' }}>
              {r.typeEmoji} {r.typeLabel}
            </span>
            <button
              onClick={() => navigate(`/customers/${encodeURIComponent(r.customerErpId)}`)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#2563eb', padding: 0 }}
            >
              {r.customerName}
            </button>
          </div>
          <div style={{ fontSize: '12px', color: urgent ? '#dc2626' : '#64748b', fontWeight: urgent ? 600 : 400 }}>{dueLabel}</div>
          {r.note && <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>"{r.note}"</div>}

          {r.status !== 'done' && editingId !== r.id && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
              <button onClick={() => { void onComplete(r); }} style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}>✓ Fatto</button>
              <button onClick={() => { void onSnooze(r, 3); }} style={{ background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>⏰ +3gg</button>
              <button onClick={() => onEditToggle(r.id)} style={{ background: editingId === r.id ? '#eff6ff' : '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✎</button>
              <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>
      </div>

      {editingId === r.id && (
        <div style={{ marginTop: '10px' }}>
          <ReminderForm
            customerProfile={r.customerErpId}
            initial={r}
            onSave={(input) => onEdit(r, input)}
            onCancel={() => onEditToggle(r.id)}
          />
        </div>
      )}

      {deletingId === r.id && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px', marginTop: '8px' }}>
          <span style={{ fontSize: '12px', color: '#dc2626' }}>Eliminare questo promemoria?</span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button onClick={() => { void onDeleteConfirm(r.id); }} style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Elimina</button>
            <button onClick={() => onDeleteToggle(r.id)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', cursor: 'pointer' }}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Eseguire il test — verificare che passi**

```bash
npm test --prefix archibald-web-app/frontend -- AgendaPage.spec
```
Atteso: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add archibald-web-app/frontend/src/pages/AgendaPage.tsx \
        archibald-web-app/frontend/src/pages/AgendaPage.spec.tsx
git commit -m "feat(frontend): AgendaPage — KPI, mini-cal mensile, lista cronologica, azioni inline"
```

---

## Task 10: Navbar + Router

**Files:**
- Modify: `archibald-web-app/frontend/src/components/DashboardNav.tsx`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`

- [ ] **Step 1: Aggiungere voce Agenda in `DashboardNav.tsx`**

Nell'array `links` (dopo `/customers`), inserisci:

```ts
{ path: "/agenda", label: "📅 Agenda" },
```

Ovvero, dopo la riga `{ path: "/customers", label: "👥 Clienti" },` aggiungi:

```ts
{ path: "/agenda", label: "📅 Agenda" },
```

- [ ] **Step 2: Aggiungere route in `AppRouter.tsx`**

In cima aggiunta import:

```ts
import { AgendaPage } from './pages/AgendaPage';
```

Nell'elenco delle `<Route>`, dopo la route `/customers`:

```tsx
<Route path="/agenda" element={<AgendaPage />} />
```

- [ ] **Step 3: Verifica finale**

```bash
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```

Atteso: 0 errori TypeScript, tutti i test PASS.

- [ ] **Step 4: Commit**

```bash
git add archibald-web-app/frontend/src/components/DashboardNav.tsx \
        archibald-web-app/frontend/src/AppRouter.tsx
git commit -m "feat(frontend): voce Agenda in navbar + route /agenda"
```

---

## Gate Finale

```bash
# TypeScript
npm run type-check --prefix archibald-web-app/frontend
npm run build --prefix archibald-web-app/backend

# Test
npm test --prefix archibald-web-app/backend
npm test --prefix archibald-web-app/frontend
```

Atteso: 0 errori, tutti i test PASS.

**Feature completa.** Cosa è stato costruito:
- `agents.reminder_types` DB table con seed 6 tipi default + CRUD completo
- `customer_reminders.type_id` FK che sostituisce la stringa enum hardcoded
- Route `/api/reminders/types` (GET/POST/PATCH/DELETE) + `/api/reminders/upcoming?days=N`
- `ReminderTypeManager` inline nel form con emoji libera + palette colori
- `ReminderForm` con tipi dinamici, chip Oggi, default oggi
- `RemindersWidgetNew` con strip settimanale lun-dom, dot colorati, azioni complete
- `AgendaPage` con KPI box, mini-cal mensile, lista cronologica, layout responsive
- Voce "📅 Agenda" in navbar + route `/agenda`
