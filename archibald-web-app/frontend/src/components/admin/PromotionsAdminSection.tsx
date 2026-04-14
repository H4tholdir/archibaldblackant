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
    try {
      await deletePromotion(id)
      invalidatePromotionsCache()
      await reload()
    } finally {
      setConfirmDeleteId(null)
    }
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
    <div style={{ padding: '1rem', color: '#9ca3af' }}>Caricamento promozioni...</div>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
          🏷️ Gestione Promozioni
        </h3>
        <button
          onClick={openNew}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none',
            borderRadius: '6px', padding: '0.375rem 0.75rem',
            fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
          }}
        >
          + Nuova promozione
        </button>
      </div>

      {promotions.length === 0 && !showForm && (
        <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
          Nessuna promozione. Clicca il pulsante in alto a destra per aggiungerne una.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: showForm ? '1rem' : 0 }}>
        {promotions.map(p => {
          const active = isActivePromo(p)
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.625rem 0.75rem',
                background: '#f9fafb',
                border: `1px solid ${active ? '#86efac' : '#e5e7eb'}`,
                borderRadius: '8px',
                opacity: active ? 1 : 0.65,
              }}
            >
              <div style={{ width: 8, height: 8, background: active ? '#16a34a' : '#9ca3af', borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{p.name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                  {p.valid_from} – {p.valid_to}
                  {p.trigger_rules.length > 0 && ` · ${p.trigger_rules.length} trigger`}
                  {p.promo_price && ` · ${parseFloat(p.promo_price).toLocaleString('it-IT')}€`}
                  {!active && !p.is_active && ' · Disattivata'}
                  {!active && p.is_active && p.valid_to < new Date().toISOString().slice(0, 10) && ' · Scaduta'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                {p.pdf_key && (
                  <button
                    onClick={() => window.open(getPromotionPdfUrl(p.id), '_blank')}
                    style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                  >📄</button>
                )}
                <button
                  onClick={() => openEdit(p)}
                  style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                >✏️ Modifica</button>
                {confirmDeleteId === p.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Sicuro?</span>
                    <button onClick={() => handleDelete(p.id)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}>Sì</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(p.id)} style={{ background: '#fff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}>🗑</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header form */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', background: '#f3f4f6' }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>
              {editingId ? '✏️ Modifica promozione' : '+ Nuova promozione'}
            </div>
          </div>

          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <label htmlFor="promo-name" style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Nome *</label>
                <input
                  id="promo-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="promo-tagline" style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Tagline</label>
                <input
                  id="promo-tagline"
                  value={form.tagline}
                  onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="promo-from" style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Valida dal *</label>
                <input
                  id="promo-from"
                  type="date"
                  value={form.validFrom}
                  onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="promo-to" style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Valida fino al *</label>
                <input
                  id="promo-to"
                  type="date"
                  value={form.validTo}
                  onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* PDF */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>PDF Promozione</div>
              <div style={{ background: '#fff', border: '2px dashed #e5e7eb', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>
                {form.pendingPdfFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>📄</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{form.pendingPdfFile.name}</span>
                    <button onClick={() => setForm(f => ({ ...f, pendingPdfFile: null }))} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem' }}>Rimuovi</button>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280' }}>
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

            {/* Trigger */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Articoli trigger</div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.625rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                  {form.triggerRules.map((rule, i) => (
                    <span
                      key={i}
                      style={{
                        background: rule.type === 'exact' ? '#dbeafe' : '#fef3c7',
                        color: rule.type === 'exact' ? '#1d4ed8' : '#92400e',
                        borderRadius: '1rem', padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '0.25rem',
                      }}
                    >
                      {rule.type === 'contains' ? `contiene: ${rule.value}` : rule.value}
                      <button onClick={() => removeTrigger(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, padding: 0, fontSize: '0.75rem' }}>✕</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                  <input
                    value={newTriggerExact}
                    onChange={e => setNewTriggerExact(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addExactTrigger()}
                    placeholder="Codice esatto (es. CERC.314.014)"
                    style={{ flex: 1, minWidth: '10rem', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                  <button onClick={addExactTrigger} style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: '6px', padding: '0.3rem 0.625rem', fontSize: '0.8rem', cursor: 'pointer' }}>+ Esatto</button>
                  <input
                    value={newTriggerContains}
                    onChange={e => setNewTriggerContains(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addContainsTrigger()}
                    placeholder="Contiene (es. .104.)"
                    style={{ flex: 1, minWidth: '10rem', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                  <button onClick={addContainsTrigger} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '6px', padding: '0.3rem 0.625rem', fontSize: '0.8rem', cursor: 'pointer' }}>+ Contiene</button>
                </div>
              </div>
            </div>

            {/* Punti di forza */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Punti di forza</div>
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.625rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
                  {form.sellingPoints.map((pt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <div style={{ flex: 1, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>{pt}</div>
                      <button onClick={() => removeSellingPoint(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.875rem' }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <input
                    value={newSellingPoint}
                    onChange={e => setNewSellingPoint(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSellingPoint()}
                    placeholder="Es. Fino all'87% più veloce"
                    style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                  <button onClick={addSellingPoint} style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '6px', padding: '0.3rem 0.625rem', fontSize: '0.8rem', cursor: 'pointer' }}>+ Aggiungi</button>
                </div>
              </div>
            </div>

            {/* Prezzi */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', fontWeight: 600, textTransform: 'uppercase' }}>Prezzo (opzionale)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.625rem' }}>
                <div>
                  <label htmlFor="promo-price" style={{ fontSize: '0.75rem', color: '#6b7280' }}>Prezzo promozione (€)</label>
                  <input
                    id="promo-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.promoPrice}
                    onChange={e => setForm(f => ({ ...f, promoPrice: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', marginTop: '0.2rem', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label htmlFor="list-price" style={{ fontSize: '0.75rem', color: '#6b7280' }}>Prezzo di listino (€)</label>
                  <input
                    id="list-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.listPrice}
                    onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))}
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', marginTop: '0.2rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              {liveSavings && (
                <div style={{ marginTop: '0.375rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.375rem 0.625rem', fontSize: '0.8rem', color: '#166534' }}>
                  ✓ Risparmio: <strong>{liveSavings.savings.toLocaleString('it-IT')}€ ({liveSavings.pct}%)</strong> — verrà mostrato nel banner
                </div>
              )}
            </div>

            {/* Attiva */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
              <input
                id="promo-active"
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              />
              <label htmlFor="promo-active" style={{ fontSize: '0.875rem' }}>Promozione attiva</label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={closeForm}
                style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: '6px', padding: '0.4rem 1rem', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.validFrom || !form.validTo}
                style={{
                  background: saving ? '#9ca3af' : '#16a34a', color: '#fff',
                  border: 'none', borderRadius: '6px', padding: '0.4rem 1rem', fontSize: '0.875rem',
                  cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
                }}
              >
                {saving ? 'Salvataggio...' : 'Salva promozione'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
