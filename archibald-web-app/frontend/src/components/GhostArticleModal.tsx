import { useState, useEffect } from 'react';
import type { PendingOrderItem } from '../types/pending-order';
import { getGhostArticles, type GhostArticleSuggestion } from '../api/fresis-history';

type GhostArticleModalProps = {
  onConfirm: (item: PendingOrderItem) => void;
  onClose: () => void;
};

export function GhostArticleModal({ onConfirm, onClose }: GhostArticleModalProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'manual'>('history');
  const [suggestions, setSuggestions] = useState<GhostArticleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state (shared between both tabs)
  const [articleCode, setArticleCode] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [vat, setVat] = useState<number | ''>('');
  const [vatError, setVatError] = useState('');

  useEffect(() => {
    setLoading(true);
    getGhostArticles()
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

  function selectSuggestion(s: GhostArticleSuggestion) {
    setArticleCode(s.articleCode);
    setDescription(s.description);
    setPrice(s.price);
    setDiscount(s.discount);
    setVat(s.vat);
    setQuantity(1);
    setVatError('');
  }

  function handleConfirm() {
    const vatNum = typeof vat === 'number' ? vat : parseInt(String(vat), 10);
    if (!articleCode.trim()) return;
    if (!Number.isInteger(vatNum) || vatNum < 0) {
      setVatError('IVA obbligatoria (es. 4, 10, 22)');
      return;
    }
    const item: PendingOrderItem = {
      articleCode: articleCode.trim(),
      description: description.trim(),
      quantity,
      price,
      discount,
      vat: vatNum,
      isGhostArticle: true,
      ghostArticleSource: activeTab,
      warehouseQuantity: quantity,
      warehouseSources: [],
    };
    onConfirm(item);
  }

  const tabStyle = (tab: 'history' | 'manual') => ({
    padding: '0.5rem 1rem',
    cursor: 'pointer' as const,
    borderBottom: activeTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
    fontWeight: activeTab === tab ? 600 : 400,
    color: activeTab === tab ? '#3b82f6' : '#6b7280',
    background: 'none',
    border: 'none',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div style={{
        background: '#fff', borderRadius: '0.75rem', padding: '1.5rem',
        width: '90%', maxWidth: '560px', maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Articolo non catalogato</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>Dallo storico FT</button>
          <button style={tabStyle('manual')} onClick={() => setActiveTab('manual')}>Inserimento manuale</button>
        </div>

        {/* Tab 1 — Storico */}
        {activeTab === 'history' && (
          <div style={{ overflowY: 'auto', maxHeight: '200px', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
            {loading && <p style={{ padding: '0.75rem', color: '#6b7280' }}>Caricamento...</p>}
            {!loading && suggestions.length === 0 && (
              <p style={{ padding: '0.75rem', color: '#6b7280' }}>Nessun articolo non catalogato trovato nello storico.</p>
            )}
            {suggestions.map((s) => (
              <div
                key={s.articleCode}
                onClick={() => selectSuggestion(s)}
                style={{
                  padding: '0.625rem 0.75rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  background: articleCode === s.articleCode ? '#eff6ff' : 'transparent',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.articleCode}</span>
                {' — '}
                <span style={{ color: '#374151', fontSize: '0.875rem' }}>{s.description}</span>
                <span style={{ float: 'right', color: '#6b7280', fontSize: '0.75rem' }}>×{s.occurrences}</span>
              </div>
            ))}
          </div>
        )}

        {/* Form condiviso */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Codice articolo *
              <input
                value={articleCode}
                onChange={(e) => setArticleCode(e.target.value)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Quantità
              <input
                type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            Descrizione
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Prezzo
              <input
                type="number" min={0} step={0.01} value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Sconto %
              <input
                type="number" min={0} max={100} value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              IVA % *
              <input
                type="number" min={0} value={vat}
                onChange={(e) => { setVat(parseInt(e.target.value) || ''); setVatError(''); }}
                style={{
                  padding: '0.375rem 0.5rem',
                  border: `1px solid ${vatError ? '#ef4444' : '#d1d5db'}`,
                  borderRadius: '0.375rem',
                }}
              />
              {vatError && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>{vatError}</span>}
            </label>
          </div>
        </div>

        {/* Bottoni */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={onClose}
            style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer', background: '#fff' }}
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={!articleCode.trim() || vat === ''}
            style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: '0.375rem',
              cursor: 'pointer', background: '#3b82f6', color: '#fff', fontWeight: 600,
            }}
          >
            Inserisci articolo
          </button>
        </div>
      </div>
    </div>
  );
}
