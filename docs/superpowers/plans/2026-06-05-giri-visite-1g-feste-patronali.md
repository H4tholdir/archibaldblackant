# Giri Visite — Piano 1g: Fase 8 — Feste Patronali UI + Override + Alert

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagina `/giri/feste` per gestire le feste patronali. Alert automatico nelle tappe quando il giorno di visita è festivo per la città del cliente. CRUD per override agente.

**Architecture:** Nuovi endpoint REST per holiday overrides. Il service di generazione già chiama `isHolidayForCity` — basta aggiungere la logica di alert dopo la creazione di ogni stop. Frontend: nuova pagina + link in VisitPlanningPage.

**Tech Stack:** Express, TypeScript strict, pg, Zod, React 19, Vitest

**Prerequisiti:** Piano 1d completato. 30 feste già importate in `system.italian_municipal_holidays`.

---

## File da creare / modificare

| File | Op | Scopo |
|---|---|---|
| `backend/src/db/repositories/municipal-holidays.ts` | Modifica | Aggiunge createOverride, deleteOverride, listOverrides |
| `backend/src/routes/visit-planning-router.ts` | Modifica | Endpoint CRUD overrides + alert in generate |
| `backend/src/services/visit-generate-service.ts` | Modifica | Alert feste nelle stop generate |
| `frontend/src/pages/PatronalHolidaysPage.tsx` | Crea | UI gestione feste |
| `frontend/src/AppRouter.tsx` | Modifica | Route /giri/feste |
| `frontend/src/pages/VisitPlanningPage.tsx` | Modifica | Link a /giri/feste |

---

## Task 1 — Backend: repository holiday overrides

**Files:**
- Modify: `archibald-web-app/backend/src/db/repositories/municipal-holidays.ts`

- [ ] **Step 1.1: Leggi il file esistente**

```bash
cat archibald-web-app/backend/src/db/repositories/municipal-holidays.ts
```

- [ ] **Step 1.2: Aggiungi le funzioni CRUD**

Aggiungi in FONDO al file:

```typescript
export type HolidayOverrideInput = {
  userId:      string;
  comune:      string;
  provincia?:  string | null;
  dateMonth:   number;
  dateDay:     number;
  holidayName?: string | null;
  isClosed:    boolean;
  note?:       string | null;
};

export type HolidayOverride = HolidayOverrideInput & {
  id: number;
  createdAt: string;
};

export async function createOverride(
  pool: DbPool,
  input: HolidayOverrideInput,
): Promise<HolidayOverride> {
  const { rows } = await pool.query(
    `INSERT INTO agents.municipal_holiday_overrides
       (user_id, comune, provincia, date_month, date_day, holiday_name, is_closed, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [input.userId, input.comune, input.provincia ?? null, input.dateMonth, input.dateDay,
     input.holidayName ?? null, input.isClosed, input.note ?? null],
  );
  const r = rows[0];
  return {
    id: r.id, userId: r.user_id, comune: r.comune,
    provincia: r.provincia, dateMonth: r.date_month, dateDay: r.date_day,
    holidayName: r.holiday_name, isClosed: r.is_closed, note: r.note,
    createdAt: r.created_at.toISOString(),
  };
}

export async function deleteOverride(
  pool: DbPool, userId: string, id: number,
): Promise<void> {
  const { rowCount } = await pool.query(
    'DELETE FROM agents.municipal_holiday_overrides WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if ((rowCount ?? 0) === 0) throw new Error('Override not found');
}

export async function listOverrides(
  pool: DbPool, userId: string,
): Promise<HolidayOverride[]> {
  const { rows } = await pool.query(
    `SELECT * FROM agents.municipal_holiday_overrides WHERE user_id = $1
     ORDER BY date_month, date_day, comune`,
    [userId],
  );
  return rows.map(r => ({
    id: r.id, userId: r.user_id, comune: r.comune,
    provincia: r.provincia, dateMonth: r.date_month, dateDay: r.date_day,
    holidayName: r.holiday_name, isClosed: r.is_closed, note: r.note,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listSystemHolidays(
  pool: DbPool,
): Promise<Array<{ id: number; comune: string; provincia: string; dateMonth: number; dateDay: number; holidayName: string; confidence: string }>> {
  const { rows } = await pool.query(
    `SELECT id, comune, provincia, date_month AS "dateMonth", date_day AS "dateDay",
            holiday_name AS "holidayName", confidence
     FROM system.italian_municipal_holidays
     ORDER BY date_month, date_day, comune`
  );
  return rows as any;
}
```

- [ ] **Step 1.3: Build TypeScript**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
```

- [ ] **Step 1.4: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/db/repositories/municipal-holidays.ts
git commit -m "feat(giri-visite): repository municipal-holidays — createOverride, deleteOverride, listOverrides"
```

---

## Task 2 — Backend: endpoint CRUD overrides e alert generate

**Files:**
- Modify: `archibald-web-app/backend/src/routes/visit-planning-router.ts`
- Modify: `archibald-web-app/backend/src/services/visit-generate-service.ts`

- [ ] **Step 2.1: Aggiorna imports nel router**

Aggiungi in cima a `visit-planning-router.ts`:

```typescript
import {
  isHolidayForCity, listHolidaysForDate,
  createOverride, deleteOverride, listOverrides, listSystemHolidays,
} from '../db/repositories/municipal-holidays';
```

- [ ] **Step 2.2: Aggiungi endpoint holidays PRIMA di `return router`**

```typescript
  // ── Feste patronali ────────────────────────────────────────────────────
  const OverrideSchema = z.object({
    comune:      z.string().min(1).max(100),
    provincia:   z.string().max(5).nullable().default(null),
    dateMonth:   z.number().int().min(1).max(12),
    dateDay:     z.number().int().min(1).max(31),
    holidayName: z.string().max(200).nullable().default(null),
    isClosed:    z.boolean().default(true),
    note:        z.string().max(500).nullable().default(null),
  });

  router.get('/holidays/system', async (_req, res) => {
    try {
      const holidays = await listSystemHolidays(pool);
      res.json(holidays);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/holidays/overrides', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const overrides = await listOverrides(pool, userId);
      res.json(overrides);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/holidays/overrides', async (req, res) => {
    const parsed = OverrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const override = await createOverride(pool, { userId, ...parsed.data });
      res.status(201).json(override);
    } catch (err) {
      logger.error('createOverride error', { err });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/holidays/overrides/:id', async (req, res) => {
    try {
      const userId = (req as AuthRequest).user!.userId;
      await deleteOverride(pool, userId, Number(req.params.id));
      res.status(204).end();
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found'))
        return res.status(404).json({ error: err.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/holidays/check', async (req, res) => {
    // GET /holidays/check?city=Napoli&month=9&day=19
    const { city, month, day } = req.query as Record<string, string>;
    if (!city || !month || !day) return res.status(400).json({ error: 'city, month, day required' });
    try {
      const userId = (req as AuthRequest).user!.userId;
      const result = await isHolidayForCity(pool, userId, city, Number(month), Number(day));
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });
```

- [ ] **Step 2.3: Aggiungi alert feste in generateVisitRoute**

In `visit-generate-service.ts`, nella funzione `generateVisitRoute`, dopo la riga `const stop = await createStop(...)`, aggiungi:

```typescript
    // Controlla se stopDate è festivo per la città del cliente
    if (c.profile.city) {
      const stopDateObj = new Date(stopDate + 'T00:00:00Z');
      const month = stopDateObj.getUTCMonth() + 1;
      const day   = stopDateObj.getUTCDate();
      try {
        const holiday = await isHolidayForCity(pool, userId, c.profile.city, month, day);
        if (holiday.isHoliday) {
          await pool.query(
            `UPDATE agents.visit_planning_stops
             SET alerts = array_append(alerts, $1), updated_at = NOW()
             WHERE id = $2`,
            [`⚠️ Possibile chiusura: ${holiday.name ?? 'Festa patronale'}`, stop.id],
          );
        }
      } catch {
        // Non blocca la generazione se il check festività fallisce
      }
    }
```

Aggiungi l'import in cima a `visit-generate-service.ts`:

```typescript
import { isHolidayForCity } from '../db/repositories/municipal-holidays';
```

- [ ] **Step 2.4: Build + test**

```bash
npm run build --prefix archibald-web-app/backend 2>&1 | tail -3
npm test --prefix archibald-web-app/backend 2>&1 | tail -5
```

- [ ] **Step 2.5: Commit**

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/backend/src/routes/visit-planning-router.ts \
        archibald-web-app/backend/src/services/visit-generate-service.ts
git commit -m "feat(giri-visite): endpoint CRUD holiday overrides + alert feste nelle stop generate"
```

---

## Task 3 — Frontend: PatronalHolidaysPage + routing

**Files:**
- Create: `archibald-web-app/frontend/src/pages/PatronalHolidaysPage.tsx`
- Modify: `archibald-web-app/frontend/src/AppRouter.tsx`
- Modify: `archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx`
- Modify: `archibald-web-app/frontend/src/services/visit-planning.service.ts`

- [ ] **Step 3.1: Aggiungi API al service**

In fondo a `visit-planning.service.ts`:

```typescript
export type HolidayOverride = {
  id: number; comune: string; provincia: string | null;
  dateMonth: number; dateDay: number;
  holidayName: string | null; isClosed: boolean; note: string | null;
};

export type SystemHoliday = {
  id: number; comune: string; provincia: string;
  dateMonth: number; dateDay: number;
  holidayName: string; confidence: string;
};

export async function listSystemHolidays(): Promise<SystemHoliday[]> {
  const res = await fetchWithRetry(`${BASE}/holidays/system`);
  if (!res.ok) throw new Error(`listSystemHolidays ${res.status}`);
  return res.json();
}

export async function listHolidayOverrides(): Promise<HolidayOverride[]> {
  const res = await fetchWithRetry(`${BASE}/holidays/overrides`);
  if (!res.ok) throw new Error(`listHolidayOverrides ${res.status}`);
  return res.json();
}

export async function createHolidayOverride(input: Omit<HolidayOverride, 'id'>): Promise<HolidayOverride> {
  const res = await fetchWithRetry(`${BASE}/holidays/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createHolidayOverride ${res.status}`);
  return res.json();
}

export async function deleteHolidayOverride(id: number): Promise<void> {
  const res = await fetchWithRetry(`${BASE}/holidays/overrides/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteHolidayOverride ${res.status}`);
}
```

- [ ] **Step 3.2: Crea PatronalHolidaysPage**

Crea `archibald-web-app/frontend/src/pages/PatronalHolidaysPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listSystemHolidays, listHolidayOverrides,
  createHolidayOverride, deleteHolidayOverride,
  type SystemHoliday, type HolidayOverride,
} from '../services/visit-planning.service';

const MONTHS = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export function PatronalHolidaysPage() {
  const navigate = useNavigate();
  const [holidays, setHolidays]   = useState<SystemHoliday[]>([]);
  const [overrides, setOverrides] = useState<HolidayOverride[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({
    comune: '', provincia: '', dateMonth: 1, dateDay: 1,
    holidayName: '', isClosed: true, note: '',
  });

  const load = () => {
    setLoading(true);
    Promise.all([listSystemHolidays(), listHolidayOverrides()])
      .then(([sys, ov]) => { setHolidays(sys); setOverrides(ov); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createHolidayOverride({
        comune: form.comune, provincia: form.provincia || null,
        dateMonth: form.dateMonth, dateDay: form.dateDay,
        holidayName: form.holidayName || null,
        isClosed: form.isClosed, note: form.note || null,
      });
      setShowForm(false);
      setForm({ comune: '', provincia: '', dateMonth: 1, dateDay: 1, holidayName: '', isClosed: true, note: '' });
      load();
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo override?')) return;
    try {
      await deleteHolidayOverride(id);
      load();
    } catch (err) {
      alert('Errore: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <button onClick={() => navigate('/giri')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>←</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎉 Feste Patronali</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Caricamento...</div>
      ) : (
        <>
          {/* Override agente */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Le mie personalizzazioni ({overrides.length})</div>
              <button
                onClick={() => setShowForm(v => !v)}
                style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
              >+ Aggiungi</button>
            </div>

            {showForm && (
              <form onSubmit={handleCreate} style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input placeholder="Comune *" required value={form.comune}
                    onChange={e => setForm(f => ({ ...f, comune: e.target.value }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
                  <input placeholder="Provincia (es. NA)" value={form.provincia}
                    onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
                  <select value={form.dateMonth} onChange={e => setForm(f => ({ ...f, dateMonth: Number(e.target.value) }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }}>
                    {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                  <input type="number" placeholder="Giorno *" required min={1} max={31}
                    value={form.dateDay} onChange={e => setForm(f => ({ ...f, dateDay: Number(e.target.value) }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
                  <input placeholder="Nome festa" value={form.holidayName}
                    onChange={e => setForm(f => ({ ...f, holidayName: e.target.value }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
                  <input placeholder="Note" value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Salva</button>
                  <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }}>Annulla</button>
                </div>
              </form>
            )}

            {overrides.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Nessuna personalizzazione. Le feste standard sono quelle della lista sottostante.</div>
            ) : (
              overrides.map(ov => (
                <div key={ov.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <span><b>{ov.comune}</b>{ov.provincia ? ` (${ov.provincia})` : ''} — {MONTHS[ov.dateMonth]} {ov.dateDay} {ov.holidayName ? `· ${ov.holidayName}` : ''}</span>
                  <button onClick={() => handleDelete(ov.id)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>Elimina</button>
                </div>
              ))
            )}
          </div>

          {/* Feste standard */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Feste standard ({holidays.length})</div>
            {holidays.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
                <span><b>{h.comune}</b> ({h.provincia}) — {MONTHS[h.dateMonth]} {h.dateDay}</span>
                <span style={{ color: '#6b7280' }}>{h.holidayName}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3.3: Aggiungi route in AppRouter.tsx**

In `AppRouter.tsx`, aggiungi l'import:

```typescript
import { PatronalHolidaysPage } from './pages/PatronalHolidaysPage';
```

E la route (PRIMA di `/giri/:sessionId` per evitare conflitti di matching):

```tsx
<Route path="/giri/feste" element={<PatronalHolidaysPage />} />
```

- [ ] **Step 3.4: Aggiungi link in VisitPlanningPage**

In `VisitPlanningPage.tsx`, in fondo al componente prima del `</div>` finale, aggiungi:

```tsx
      <div style={{ textAlign: 'center', marginTop: 24, paddingBottom: 40 }}>
        <a href="/giri/feste" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>
          🎉 Gestisci feste patronali →
        </a>
      </div>
```

- [ ] **Step 3.5: Type-check + test + commit**

```bash
npm run type-check --prefix archibald-web-app/frontend 2>&1 | tail -3
npm test --prefix archibald-web-app/frontend 2>&1 | tail -5
```

```bash
cd /Users/hatholdir/Downloads/Archibald
git add archibald-web-app/frontend/src/pages/PatronalHolidaysPage.tsx \
        archibald-web-app/frontend/src/AppRouter.tsx \
        archibald-web-app/frontend/src/pages/VisitPlanningPage.tsx \
        archibald-web-app/frontend/src/services/visit-planning.service.ts
git commit -m "feat(giri-visite): PatronalHolidaysPage — UI feste patronali + override + routing"
git push origin master
```

---

## Checklist Gate Piano 1g

- [ ] `GET /api/visit-planning/holidays/system` → 30 record
- [ ] `POST /api/visit-planning/holidays/overrides` → crea override, `DELETE` rimuove
- [ ] Stop generate in giorno festivo → `alerts` include avviso festività
- [ ] `/giri/feste` apre senza crash, mostra feste standard e form aggiunta
- [ ] Build + test passano
