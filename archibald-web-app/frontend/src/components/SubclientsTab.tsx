import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getSubclients,
  clearSubclientMatch,
  setSubclientMatch,
  updateSubclient,
  createSubclient,
  deleteSubclient,
} from '../services/subclients.service';
import type { Subclient } from '../services/subclients.service';
import { customerService } from '../services/customers.service';
import type { Customer } from '../types/local-customer';

function matchBadge(confidence: string | null) {
  if (!confidence) return { label: 'Non matchato', bg: '#EF4444' };
  if (confidence === 'vat') return { label: 'P.IVA', bg: '#16a34a' };
  if (confidence === 'multi-field') return { label: 'Multi-campo', bg: '#ca8a04' };
  if (confidence === 'manual') return { label: 'Manuale', bg: '#2563EB' };
  return { label: confidence, bg: '#6b7280' };
}

function computeNextCodice(subclients: Subclient[]): string {
  const nums: number[] = [];
  for (const sc of subclients) {
    const m = sc.codice.match(/^C(\d+)$/);
    if (m) nums.push(parseInt(m[1], 10));
  }
  nums.sort((a, b) => a - b);
  let next = 1;
  for (const n of nums) {
    if (n === next) { next++; continue; }
    if (n > next) break;
  }
  return `C${String(next).padStart(5, '0')}`;
}

const EDITABLE_FIELDS: Array<{ key: keyof Subclient; label: string; readOnlyOnEdit?: boolean }> = [
  { key: 'codice', label: 'Codice', readOnlyOnEdit: true },
  { key: 'ragioneSociale', label: 'Ragione Sociale' },
  { key: 'supplRagioneSociale', label: 'Suppl. Rag. Sociale' },
  { key: 'partitaIva', label: 'P.IVA' },
  { key: 'codFiscale', label: 'Cod. Fiscale' },
  { key: 'indirizzo', label: 'Indirizzo' },
  { key: 'cap', label: 'CAP' },
  { key: 'localita', label: 'Localita' },
  { key: 'prov', label: 'Provincia' },
  { key: 'codNazione', label: 'Nazione' },
  { key: 'telefono', label: 'Telefono' },
  { key: 'telefono2', label: 'Telefono 2' },
  { key: 'telefono3', label: 'Telefono 3' },
  { key: 'fax', label: 'Fax' },
  { key: 'email', label: 'Email' },
  { key: 'emailAmministraz', label: 'Email Amministraz.' },
  { key: 'persDaContattare', label: 'Persona da contattare' },
  { key: 'zona', label: 'Zona' },
  { key: 'agente', label: 'Agente' },
  { key: 'agente2', label: 'Agente 2' },
  { key: 'settore', label: 'Settore' },
  { key: 'classe', label: 'Classe' },
  { key: 'pag', label: 'Pagamento' },
  { key: 'listino', label: 'Listino' },
  { key: 'banca', label: 'Banca' },
  { key: 'valuta', label: 'Valuta' },
  { key: 'aliiva', label: 'Aliquota IVA' },
  { key: 'contoscar', label: 'Conto scarico' },
  { key: 'tipofatt', label: 'Tipo fattura' },
  { key: 'url', label: 'URL' },
  { key: 'cbNazione', label: 'CB Nazione' },
  { key: 'cbBic', label: 'CB BIC' },
  { key: 'cbCinUe', label: 'CB CIN UE' },
  { key: 'cbCinIt', label: 'CB CIN IT' },
  { key: 'abicab', label: 'ABICAB' },
  { key: 'contocorr', label: 'Conto Corrente' },
];

function emptySubclient(codice: string): Subclient {
  return {
    codice,
    ragioneSociale: '',
    supplRagioneSociale: null, indirizzo: null, cap: null, localita: null,
    prov: null, telefono: null, fax: null, email: null, partitaIva: null,
    codFiscale: null, zona: null, persDaContattare: null, emailAmministraz: null,
    agente: null, agente2: null, settore: null, classe: null, pag: null,
    listino: null, banca: null, valuta: null, codNazione: null, aliiva: null,
    contoscar: null, tipofatt: null, telefono2: null, telefono3: null,
    url: null, cbNazione: null, cbBic: null, cbCinUe: null, cbCinIt: null,
    abicab: null, contocorr: null,
    matchedCustomerProfileId: null, matchConfidence: null, arcaSyncedAt: null,
  };
}

// ─── Customer Picker Modal ───────────────────────────────────────────

export function CustomerPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (customerProfileId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    customerService.searchCustomers(debouncedQuery, 30).then((r) => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10001, padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '20px',
        maxWidth: '500px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Collega cliente Archibald</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>×</button>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Cerca per nome, P.IVA, telefono, indirizzo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px',
          }}
        />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Ricerca...</div>}
          {!loading && debouncedQuery.length >= 2 && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Nessun risultato</div>
          )}
          {results.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              style={{
                padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                marginBottom: '4px', border: '1px solid #eee',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f0f7ff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#fff'; }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#333' }}>{c.name}</div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                {c.code}
                {c.taxCode && ` · ${c.taxCode}`}
              </div>
              {(c.address || c.city) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {c.address}{c.city && `, ${c.city}`}
                </div>
              )}
              {(c.phone || c.email) && (
                <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                  {c.phone}{c.email && ` · ${c.email}`}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Subclient Form Modal (View / Edit / Create) ────────────────────

function SubclientFormModal({
  subclient,
  isNew,
  existingCodici,
  onSave,
  onDelete,
  onClose,
}: {
  subclient: Subclient;
  isNew: boolean;
  existingCodici: Set<string>;
  onSave: (data: Subclient, isNew: boolean) => Promise<void>;
  onDelete: (codice: string) => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<Subclient>({ ...subclient });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codiceConflict = isNew && form.codice !== subclient.codice && existingCodici.has(form.codice);
  const canSave = form.codice.trim() !== '' && form.ragioneSociale.trim() !== '' && !codiceConflict;

  const handleFieldChange = (key: keyof Subclient, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value || null }));
    setError(null);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(form, isNew);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(subclient.codice);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nell\'eliminazione');
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
        maxWidth: '540px', width: '100%', maxHeight: '85vh', overflow: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {isNew ? 'Nuovo sottocliente' : form.ragioneSociale || subclient.ragioneSociale}
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isNew && !editing && (
              <button
                onClick={() => setEditing(true)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', border: '1px solid #ddd',
                  backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', color: '#333',
                }}
              >
                Modifica
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999', padding: '4px' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: '8px', backgroundColor: '#FEE2E2',
            color: '#DC2626', fontSize: '13px', marginBottom: '12px',
          }}>
            {error}
          </div>
        )}

        {/* Fields grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: '13px' }}>
          {EDITABLE_FIELDS.map(({ key, label, readOnlyOnEdit }) => {
            const value = form[key] as string | null;
            const isReadOnly = !editing || (readOnlyOnEdit && !isNew);

            if (!editing && !value) return null;

            return (
              <div key={key} style={{ display: 'contents' }}>
                <div style={{ color: '#888', fontWeight: 500, paddingTop: editing ? '8px' : '0' }}>{label}</div>
                {isReadOnly ? (
                  <div style={{ color: '#333', paddingTop: editing ? '8px' : '0' }}>{value || '—'}</div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={value ?? ''}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      style={{
                        width: '100%', padding: '6px 10px', borderRadius: '6px',
                        border: `1px solid ${key === 'codice' && codiceConflict ? '#EF4444' : '#ddd'}`,
                        fontSize: '13px', boxSizing: 'border-box',
                      }}
                    />
                    {key === 'codice' && codiceConflict && (
                      <div style={{ color: '#EF4444', fontSize: '11px', marginTop: '2px' }}>Codice già esistente</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Match info (read-only always) */}
          {!isNew && !editing && (
            <>
              <div style={{ color: '#888', fontWeight: 500 }}>Match</div>
              <div style={{ color: '#333' }}>
                {subclient.matchedCustomerProfileId
                  ? `${subclient.matchedCustomerProfileId} (${subclient.matchConfidence})`
                  : 'Non matchato'}
              </div>
              <div style={{ color: '#888', fontWeight: 500 }}>Ultima sync Arca</div>
              <div style={{ color: '#333' }}>{subclient.arcaSyncedAt ?? 'Mai'}</div>
            </>
          )}
        </div>

        {/* Footer buttons */}
        {editing && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {!isNew && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid #EF4444',
                  backgroundColor: '#fff', color: '#EF4444', cursor: 'pointer', fontSize: '13px',
                }}
              >
                Elimina
              </button>
            )}
            {confirmDelete && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#EF4444' }}>Sei sicuro?</span>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: 'none',
                    backgroundColor: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: '12px',
                  }}
                >
                  {saving ? '...' : 'Conferma'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid #ddd',
                    backgroundColor: '#fff', cursor: 'pointer', fontSize: '12px',
                  }}
                >
                  No
                </button>
              </div>
            )}
            {isNew && <div />}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  if (isNew) { onClose(); } else { setEditing(false); setForm({ ...subclient }); setError(null); }
                }}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: '1px solid #ddd',
                  backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px',
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !canSave}
                style={{
                  padding: '8px 16px', borderRadius: '8px', border: 'none',
                  backgroundColor: canSave ? '#2563EB' : '#93c5fd', color: '#fff',
                  cursor: canSave ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600,
                }}
              >
                {saving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subclient Card ──────────────────────────────────────────────────

function SubclientCard({
  subclient,
  onSelect,
  onUnlink,
  onLink,
}: {
  subclient: Subclient;
  onSelect: () => void;
  onUnlink: () => void;
  onLink: () => void;
}) {
  const badge = matchBadge(subclient.matchConfidence);

  return (
    <div
      onClick={onSelect}
      style={{
        backgroundColor: '#fff', borderRadius: '12px', padding: '14px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', cursor: 'pointer', marginBottom: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#333' }}>
            {subclient.ragioneSociale}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
            Codice: {subclient.codice}
            {subclient.partitaIva && ` · P.IVA: ${subclient.partitaIva}`}
          </div>
          {subclient.indirizzo && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              {subclient.indirizzo}
              {subclient.localita && `, ${subclient.localita}`}
              {subclient.prov && ` (${subclient.prov})`}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            {subclient.zona && (
              <span style={{ fontSize: '11px', color: '#777' }}>Zona: {subclient.zona}</span>
            )}
            {subclient.telefono && (
              <span style={{ fontSize: '11px', color: '#777' }}>Tel: {subclient.telefono}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span
            style={{
              display: 'inline-flex', padding: '3px 8px', borderRadius: '10px',
              backgroundColor: badge.bg, color: '#fff', fontSize: '10px', fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
          {subclient.matchedCustomerProfileId ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnlink(); }}
              style={{
                padding: '3px 8px', borderRadius: '10px', border: '1px solid #ddd',
                backgroundColor: '#fff', fontSize: '10px', cursor: 'pointer', color: '#666',
              }}
              title="Scollega match"
            >
              Scollega
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onLink(); }}
              style={{
                padding: '3px 8px', borderRadius: '10px', border: '1px solid #2563EB',
                backgroundColor: '#EFF6FF', fontSize: '10px', cursor: 'pointer', color: '#2563EB', fontWeight: 600,
              }}
              title="Collega a cliente Archibald"
            >
              Collega
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main SubclientsTab ──────────────────────────────────────────────

function SubclientsTab() {
  const [subclients, setSubclients] = useState<Subclient[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSubclient, setSelectedSubclient] = useState<Subclient | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [linkingCodice, setLinkingCodice] = useState<string | null>(null);

  const existingCodici = useMemo(() => new Set(subclients.map((s) => s.codice)), [subclients]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubclients(debouncedSearch || undefined);
      setSubclients(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUnlink = useCallback(async (codice: string) => {
    try {
      await clearSubclientMatch(codice);
      setSubclients((prev) =>
        prev.map((s) =>
          s.codice === codice ? { ...s, matchedCustomerProfileId: null, matchConfidence: null } : s,
        ),
      );
    } catch {
      // silently handle
    }
  }, []);

  const handleLink = useCallback(async (codice: string, customerProfileId: string) => {
    try {
      await setSubclientMatch(codice, customerProfileId);
      setSubclients((prev) =>
        prev.map((s) =>
          s.codice === codice ? { ...s, matchedCustomerProfileId: customerProfileId, matchConfidence: 'manual' } : s,
        ),
      );
      setLinkingCodice(null);
    } catch {
      // silently handle
    }
  }, []);

  const handleSave = useCallback(async (data: Subclient, isNew: boolean) => {
    if (isNew) {
      await createSubclient(data);
    } else {
      const { codice: _, matchedCustomerProfileId: _m, matchConfidence: _c, arcaSyncedAt: _a, ...updates } = data;
      await updateSubclient(data.codice, updates);
    }
    setSelectedSubclient(null);
    setCreatingNew(false);
    await fetchData();
  }, [fetchData]);

  const handleDelete = useCallback(async (codice: string) => {
    await deleteSubclient(codice);
    setSelectedSubclient(null);
    await fetchData();
  }, [fetchData]);

  const newSubclient = useMemo(() => {
    const nextCode = computeNextCodice(subclients);
    return emptySubclient(nextCode);
  }, [subclients]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Cerca sottoclienti..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => setCreatingNew(true)}
          style={{
            padding: '10px 16px', borderRadius: '8px', border: 'none',
            backgroundColor: '#2563EB', color: '#fff', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          + Nuovo
        </button>
      </div>

      {loading && subclients.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          Caricamento sottoclienti...
        </div>
      )}

      {!loading && subclients.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          Nessun sottocliente trovato
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
        {subclients.length} sottoclienti
      </div>

      {subclients.map((sc) => (
        <SubclientCard
          key={sc.codice}
          subclient={sc}
          onSelect={() => setSelectedSubclient(sc)}
          onUnlink={() => handleUnlink(sc.codice)}
          onLink={() => setLinkingCodice(sc.codice)}
        />
      ))}

      {/* Detail/Edit Modal */}
      {selectedSubclient && (
        <SubclientFormModal
          subclient={selectedSubclient}
          isNew={false}
          existingCodici={existingCodici}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setSelectedSubclient(null)}
        />
      )}

      {/* Create Modal */}
      {creatingNew && (
        <SubclientFormModal
          subclient={newSubclient}
          isNew={true}
          existingCodici={existingCodici}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setCreatingNew(false)}
        />
      )}

      {/* Customer Picker Modal */}
      {linkingCodice && (
        <CustomerPickerModal
          onSelect={(profileId) => handleLink(linkingCodice, profileId)}
          onClose={() => setLinkingCodice(null)}
        />
      )}
    </div>
  );
}

export { SubclientsTab };
