import { useState, useEffect } from 'react'
import type { Promotion, TriggerRule, CreatePromotionPayload } from '../../types/promotion'
import {
  fetchAllPromotions, createPromotion, updatePromotion,
  deletePromotion, uploadPromotionPdf, getPromotionPdfUrl,
} from '../../api/promotions.api'
import { invalidatePromotionsCache } from '../../hooks/usePromotions'

type FormState = {
  name: string
  tagline: string
  validFrom: string
  validTo: string
  triggerRules: TriggerRule[]
  sellingPoints: string[]
  promoPrice: string
  listPrice: string
  isActive: boolean
  pendingPdfFile: File | null
}

const EMPTY_FORM: FormState = {
  name: '', tagline: '', validFrom: '', validTo: '',
  triggerRules: [], sellingPoints: [],
  promoPrice: '', listPrice: '', isActive: true, pendingPdfFile: null,
}

function promoToForm(p: Promotion): FormState {
  return {
    name: p.name, tagline: p.tagline ?? '',
    validFrom: p.valid_from, validTo: p.valid_to,
    triggerRules: p.trigger_rules, sellingPoints: p.selling_points,
    promoPrice: p.promo_price ?? '', listPrice: p.list_price ?? '',
    isActive: p.is_active, pendingPdfFile: null,
  }
}

function isActivePromo(p: Promotion): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return p.is_active && p.valid_from <= today && p.valid_to >= today
}

export function PromotionsAdminSection() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [newTriggerExact, setNewTriggerExact] = useState('')
  const [newTriggerContains, setNewTriggerContains] = useState('')
  const [newSellingPoint, setNewSellingPoint] = useState('')

  useEffect(() => { void reload() }, [])

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchAllPromotions()
      setPromotions(data)
    } finally {
      setLoading(false)
    }
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p: Promotion) {
    setEditingId(p.id)
    setForm(promoToForm(p))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.name || !form.validFrom || !form.validTo) return
    setSaving(true)
    try {
      const payload: CreatePromotionPayload = {
        name: form.name,
        tagline: form.tagline || null,
        validFrom: form.validFrom,
        validTo: form.validTo,
        triggerRules: form.triggerRules,
        sellingPoints: form.sellingPoints,
        promoPrice: form.promoPrice ? parseFloat(form.promoPrice) : null,
        listPrice: form.listPrice ? parseFloat(form.listPrice) : null,
        isActive: form.isActive,
      }
      let saved: Promotion
      if (editingId) {
        saved = await updatePromotion(editingId, payload)
      } else {
        saved = await createPromotion(payload)
      }
      if (form.pendingPdfFile) {
        await uploadPromotionPdf(saved.id, form.pendingPdfFile)
      }
      invalidatePromotionsCache()
      await reload()
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await deletePromotion(id)
    invalidatePromotionsCache()
    setConfirmDeleteId(null)
    await reload()
  }

  function addExactTrigger() {
    const v = newTriggerExact.trim()
    if (!v) return
    setForm(f => ({ ...f, triggerRules: [...f.triggerRules, { type: 'exact', value: v }] }))
    setNewTriggerExact('')
  }

  function addContainsTrigger() {
    const v = newTriggerContains.trim()
    if (!v) return
    setForm(f => ({ ...f, triggerRules: [...f.triggerRules, { type: 'contains', value: v }] }))
    setNewTriggerContains('')
  }

  function removeTrigger(i: number) {
    setForm(f => ({ ...f, triggerRules: f.triggerRules.filter((_, idx) => idx !== i) }))
  }

  function addSellingPoint() {
    const v = newSellingPoint.trim()
    if (!v) return
    setForm(f => ({ ...f, sellingPoints: [...f.sellingPoints, v] }))
    setNewSellingPoint('')
  }

  function removeSellingPoint(i: number) {
    setForm(f => ({ ...f, sellingPoints: f.sellingPoints.filter((_, idx) => idx !== i) }))
  }

  const livePromoPrice = form.promoPrice ? parseFloat(form.promoPrice) : null
  const liveListPrice = form.listPrice ? parseFloat(form.listPrice) : null
  const liveSavings = livePromoPrice && liveListPrice && liveListPrice > 0
    ? { savings: liveListPrice - livePromoPrice, pct: Math.round(((liveListPrice - livePromoPrice) / liveListPrice) * 100) }
    : null

  if (loading) return (
    <section>
      <div style={{ color: '#64748b', fontSize: 14 }}>Caricamento promozioni...</div>
    </section>
  )

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>🏷️ Gestione Promozioni</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            Le promozioni attive appaiono nel form ordine quando l'agente inserisce un articolo corrispondente.
          </p>
        </div>
        <button
          onClick={openNew}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
        >
          + Nuova promozione
        </button>
      </div>

      {promotions.length === 0 && !showForm && (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Nessuna promozione. Clicca il pulsante in alto a destra per aggiungerne una.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: showForm ? 20 : 0 }}>
        {promotions.map(p => {
          const active = isActivePromo(p)
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: active ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${active ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 8, opacity: active ? 1 : 0.6,
              }}
            >
              <div style={{ width: 8, height: 8, background: active ? '#22c55e' : '#94a3b8', borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{p.name}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  {p.valid_from} – {p.valid_to}
                  {p.trigger_rules.length > 0 && ` · ${p.trigger_rules.length} trigger`}
                  {p.promo_price && ` · ${parseFloat(p.promo_price).toLocaleString('it-IT')}€`}
                  {!active && !p.is_active && ' · Disattivata'}
                  {!active && p.is_active && p.valid_to < new Date().toISOString().slice(0, 10) && ' · Scaduta'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.pdf_key && (
                  <button
                    onClick={() => window.open(getPromotionPdfUrl(p.id), '_blank')}
                    style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: 'pointer' }}
                  >📄</button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}
                >✏️ Modifica</button>
                {confirmDeleteId === p.id ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#ef4444' }}>Sicuro?</span>
                    <button onClick={() => handleDelete(p.id)} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>Sì</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(p.id)} style={{ background: '#fff', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
          <h4 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: 14 }}>
            {editingId ? '✏️ Modifica promozione' : '+ Nuova promozione'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="promo-name" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Nome promozione *</label>
              <input
                id="promo-name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-tagline" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Tagline</label>
              <input
                id="promo-tagline"
                value={form.tagline}
                onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-from" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Valida dal *</label>
              <input
                id="promo-from"
                type="date"
                value={form.validFrom}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="promo-to" style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Valida fino al *</label>
              <input
                id="promo-to"
                type="date"
                value={form.validTo}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>PDF Promozione</div>
            <div style={{ background: '#fff', border: '2px dashed #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
              {form.pendingPdfFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📄</span>
                  <span style={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>{form.pendingPdfFile.name}</span>
                  <button onClick={() => setForm(f => ({ ...f, pendingPdfFile: null }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11 }}>Rimuovi</button>
                </div>
              ) : (
                <label style={{ cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                  📎 Clicca per caricare un PDF (max 20MB)
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) setForm(f => ({ ...f, pendingPdfFile: file }))
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Articoli trigger</div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {form.triggerRules.map((rule, i) => (
                  <span
                    key={i}
                    style={{
                      background: rule.type === 'exact' ? '#dbeafe' : '#fef3c7',
                      color: rule.type === 'exact' ? '#1d4ed8' : '#92400e',
                      borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {rule.type === 'contains' ? `contiene: ${rule.value}` : rule.value}
                    <button onClick={() => removeTrigger(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0, fontSize: 11 }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newTriggerExact}
                  onChange={e => setNewTriggerExact(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addExactTrigger()}
                  placeholder="Codice esatto (es. CERC.314.014)"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addExactTrigger} style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Esatto</button>
                <input
                  value={newTriggerContains}
                  onChange={e => setNewTriggerContains(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addContainsTrigger()}
                  placeholder="Contiene (es. .104.)"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addContainsTrigger} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Contiene</button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Punti di forza</div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {form.sellingPoints.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '5px 8px', fontSize: 12 }}>{pt}</div>
                    <button onClick={() => removeSellingPoint(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newSellingPoint}
                  onChange={e => setNewSellingPoint(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSellingPoint()}
                  placeholder="Es. Fino all'87% più veloce"
                  style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 11 }}
                />
                <button onClick={addSellingPoint} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>+ Aggiungi</button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Prezzo (opzionale)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label htmlFor="promo-price" style={{ fontSize: 11, color: '#64748b' }}>Prezzo promozione (€)</label>
                <input
                  id="promo-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.promoPrice}
                  onChange={e => setForm(f => ({ ...f, promoPrice: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginTop: 3, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="list-price" style={{ fontSize: 11, color: '#64748b' }}>Prezzo di listino (€)</label>
                <input
                  id="list-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.listPrice}
                  onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginTop: 3, boxSizing: 'border-box' }}
                />
              </div>
            </div>
            {liveSavings && (
              <div style={{ marginTop: 6, background: '#f0fdf4', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#166534' }}>
                ✓ Risparmio: <strong>{liveSavings.savings.toLocaleString('it-IT')}€ ({liveSavings.pct}%)</strong> — verrà mostrato nel banner
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input
              id="promo-active"
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="promo-active" style={{ fontSize: 12, color: '#1e293b' }}>Promozione attiva</label>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={closeForm} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}>
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.validFrom || !form.validTo}
              style={{
                background: saving ? '#94a3b8' : '#22c55e', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
              }}
            >
              {saving ? 'Salvataggio...' : 'Salva promozione'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
