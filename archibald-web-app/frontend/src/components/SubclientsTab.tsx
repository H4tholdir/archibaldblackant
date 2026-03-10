import { useState, useEffect, useCallback } from 'react';
import {
  getSubclients,
  clearSubclientMatch,
} from '../services/subclients.service';
import type { Subclient } from '../services/subclients.service';

function matchBadge(confidence: string | null) {
  if (!confidence) return { label: 'Non matchato', bg: '#EF4444' };
  if (confidence === 'vat') return { label: 'P.IVA', bg: '#16a34a' };
  if (confidence === 'multi-field') return { label: 'Multi-campo', bg: '#ca8a04' };
  if (confidence === 'manual') return { label: 'Manuale', bg: '#2563EB' };
  return { label: confidence, bg: '#6b7280' };
}

function SubclientCard({
  subclient,
  onSelect,
  onUnlink,
}: {
  subclient: Subclient;
  onSelect: () => void;
  onUnlink: () => void;
}) {
  const badge = matchBadge(subclient.matchConfidence);

  return (
    <div
      onClick={onSelect}
      style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '14px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        marginBottom: '8px',
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
              display: 'inline-flex',
              padding: '3px 8px',
              borderRadius: '10px',
              backgroundColor: badge.bg,
              color: '#fff',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            {badge.label}
          </span>
          {subclient.matchedCustomerProfileId && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnlink(); }}
              style={{
                padding: '3px 8px',
                borderRadius: '10px',
                border: '1px solid #ddd',
                backgroundColor: '#fff',
                fontSize: '10px',
                cursor: 'pointer',
                color: '#666',
              }}
              title="Scollega match"
            >
              Scollega
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SubclientDetail({
  subclient,
  onClose,
}: {
  subclient: Subclient;
  onClose: () => void;
}) {
  const fields: Array<[string, string | null]> = [
    ['Codice', subclient.codice],
    ['Ragione Sociale', subclient.ragioneSociale],
    ['Suppl. Rag. Sociale', subclient.supplRagioneSociale],
    ['P.IVA', subclient.partitaIva],
    ['Cod. Fiscale', subclient.codFiscale],
    ['Indirizzo', subclient.indirizzo],
    ['CAP', subclient.cap],
    ['Localita', subclient.localita],
    ['Provincia', subclient.prov],
    ['Nazione', subclient.codNazione],
    ['Telefono', subclient.telefono],
    ['Telefono 2', subclient.telefono2],
    ['Telefono 3', subclient.telefono3],
    ['Fax', subclient.fax],
    ['Email', subclient.email],
    ['Email Amministraz.', subclient.emailAmministraz],
    ['Persona da contattare', subclient.persDaContattare],
    ['Zona', subclient.zona],
    ['Agente', subclient.agente],
    ['Agente 2', subclient.agente2],
    ['Settore', subclient.settore],
    ['Classe', subclient.classe],
    ['Pagamento', subclient.pag],
    ['Listino', subclient.listino],
    ['Banca', subclient.banca],
    ['Valuta', subclient.valuta],
    ['Aliquota IVA', subclient.aliiva],
    ['Conto scarico', subclient.contoscar],
    ['Tipo fattura', subclient.tipofatt],
    ['URL', subclient.url],
    ['Match', subclient.matchedCustomerProfileId
      ? `${subclient.matchedCustomerProfileId} (${subclient.matchConfidence})`
      : 'Non matchato'],
    ['Ultima sync Arca', subclient.arcaSyncedAt ?? 'Mai'],
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            {subclient.ragioneSociale}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              color: '#999',
              padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: '13px' }}>
          {fields.map(([label, value]) => (
            value ? (
              <div key={label} style={{ display: 'contents' }}>
                <div style={{ color: '#888', fontWeight: 500 }}>{label}</div>
                <div style={{ color: '#333' }}>{value}</div>
              </div>
            ) : null
          ))}
        </div>
      </div>
    </div>
  );
}

function SubclientsTab() {
  const [subclients, setSubclients] = useState<Subclient[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSubclient, setSelectedSubclient] = useState<Subclient | null>(null);

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
          s.codice === codice
            ? { ...s, matchedCustomerProfileId: null, matchConfidence: null }
            : s,
        ),
      );
    } catch {
      // silently handle
    }
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="Cerca sottoclienti..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
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
        />
      ))}

      {selectedSubclient && (
        <SubclientDetail
          subclient={selectedSubclient}
          onClose={() => setSelectedSubclient(null)}
        />
      )}
    </div>
  );
}

export { SubclientsTab };
