import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getSubclients,
  updateSubclient,
  createSubclient,
  setSubclientHidden,
  getHiddenSubclients,
} from '../services/subclients.service';
import type { Subclient } from '../services/subclients.service';
import { MatchingManagerModal } from './MatchingManagerModal';

type MatchCount = { customerCount: number; subClientCount: number };

function matchCountBadge(counts: MatchCount | undefined) {
  if (!counts || (counts.customerCount === 0 && counts.subClientCount === 0)) {
    return { label: 'Non matchato', bg: '#EF4444' };
  }
  const parts: string[] = [];
  if (counts.customerCount > 0) parts.push(counts.customerCount === 1 ? '1 cliente' : `${counts.customerCount} clienti`);
  if (counts.subClientCount > 0) parts.push(counts.subClientCount === 1 ? '1 sottocliente' : `${counts.subClientCount} sottoclienti`);
  return { label: parts.join(' · '), bg: '#16a34a' };
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
    customerMatchCount: 0,
    subClientMatchCount: 0,
  };
}

// ─── Subclient Form Modal (View / Edit / Create) ────────────────────

function SubclientFormModal({
  subclient,
  isNew,
  existingCodici,
  onSave,
  onHide,
  onClose,
}: {
  subclient: Subclient;
  isNew: boolean;
  existingCodici: Set<string>;
  onSave: (data: Subclient, isNew: boolean) => Promise<void>;
  onHide: (codice: string) => Promise<void>;
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
      await onHide(subclient.codice);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore nel nascondere il sottocliente');
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
                Nascondi
              </button>
            )}
            {confirmDelete && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#EF4444' }}>Nascondere?</span>
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
  matchCount,
  onSelect,
  onLink,
}: {
  subclient: Subclient;
  matchCount: MatchCount | undefined;
  onSelect: () => void;
  onLink: () => void;
}) {
  const badge = matchCountBadge(matchCount);

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
          <button
            onClick={(e) => { e.stopPropagation(); onLink(); }}
            style={{
              padding: '3px 8px', borderRadius: '10px', border: '1px solid #2563EB',
              backgroundColor: '#EFF6FF', fontSize: '10px', cursor: 'pointer', color: '#2563EB', fontWeight: 600,
            }}
            title="Gestisci matching storico"
          >
            Collega
          </button>
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
  const [linkingSubclient, setLinkingSubclient] = useState<Subclient | null>(null);
  const [matchCounts, setMatchCounts] = useState<Map<string, MatchCount>>(new Map());
  const [showHiddenSection, setShowHiddenSection] = useState(false);
  const [hiddenList, setHiddenList] = useState<Subclient[] | null>(null);
  const [restoringCodice, setRestoringCodice] = useState<string | null>(null);

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
      const counts = new Map<string, MatchCount>(
        data.map((sc) => [
          sc.codice,
          { customerCount: sc.customerMatchCount, subClientCount: sc.subClientMatchCount },
        ]),
      );
      setMatchCounts(counts);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = useCallback(async (data: Subclient, isNew: boolean) => {
    if (isNew) {
      await createSubclient(data);
    } else {
      const { codice: _, matchedCustomerProfileId: _m, matchConfidence: _c, arcaSyncedAt: _a, customerMatchCount: _cc, subClientMatchCount: _scc, ...updates } = data;
      await updateSubclient(data.codice, updates);
    }
    setSelectedSubclient(null);
    setCreatingNew(false);
    await fetchData();
  }, [fetchData]);

  const handleHide = useCallback(async (codice: string) => {
    await setSubclientHidden(codice, true);
    setSelectedSubclient(null);
    setHiddenList(null); // force reload next time
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
          matchCount={matchCounts.get(sc.codice)}
          onSelect={() => setSelectedSubclient(sc)}
          onLink={() => setLinkingSubclient(sc)}
        />
      ))}

      {/* Sezione nascosti */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={async () => {
            if (!showHiddenSection) {
              if (hiddenList === null) {
                const list = await getHiddenSubclients();
                setHiddenList(list);
              }
              setShowHiddenSection(true);
            } else {
              setShowHiddenSection(false);
            }
          }}
          style={{
            padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
            backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'pointer',
            fontSize: '12px', fontWeight: 500,
          }}
        >
          {showHiddenSection ? '▲ Nascondi nascosti' : `👁 Mostra nascosti${hiddenList ? ` (${hiddenList.length})` : ''}`}
        </button>

        {showHiddenSection && hiddenList && (
          <div style={{ marginTop: '8px' }}>
            {hiddenList.length === 0 && (
              <div style={{ fontSize: '12px', color: '#9ca3af', padding: '8px 0' }}>Nessun sottocliente nascosto</div>
            )}
            {hiddenList.map((sc) => (
              <div key={sc.codice} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: '8px', marginBottom: '4px',
                backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', opacity: 0.75,
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280' }}>{sc.ragioneSociale}</div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{sc.codice}{sc.partitaIva && ` · P.IVA: ${sc.partitaIva}`}</div>
                </div>
                <button
                  onClick={async () => {
                    setRestoringCodice(sc.codice);
                    try {
                      await setSubclientHidden(sc.codice, false);
                      setHiddenList((prev) => prev ? prev.filter((x) => x.codice !== sc.codice) : []);
                      await fetchData();
                    } finally {
                      setRestoringCodice(null);
                    }
                  }}
                  disabled={restoringCodice === sc.codice}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', border: '1px solid #86efac',
                    backgroundColor: '#f0fdf4', color: '#16a34a', cursor: 'pointer',
                    fontSize: '12px', fontWeight: 500,
                  }}
                >
                  {restoringCodice === sc.codice ? '...' : 'Ripristina'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail/Edit Modal */}
      {selectedSubclient && (
        <SubclientFormModal
          subclient={selectedSubclient}
          isNew={false}
          existingCodici={existingCodici}
          onSave={handleSave}
          onHide={handleHide}
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
          onHide={handleHide}
          onClose={() => setCreatingNew(false)}
        />
      )}

      {/* Matching Manager Modal */}
      {linkingSubclient && (
        <MatchingManagerModal
          mode="subclient"
          subClientCodice={linkingSubclient.codice}
          entityName={linkingSubclient.ragioneSociale}
          onConfirm={(ids) => {
            const codice = linkingSubclient.codice;
            setMatchCounts((prev) => new Map([...prev, [codice, {
              customerCount: ids.customerProfileIds.length,
              subClientCount: ids.subClientCodices.length,
            }]]));
            setLinkingSubclient(null);
          }}
          onSkip={() => setLinkingSubclient(null)}
          onClose={() => setLinkingSubclient(null)}
        />
      )}
    </div>
  );
}

export { SubclientsTab };
