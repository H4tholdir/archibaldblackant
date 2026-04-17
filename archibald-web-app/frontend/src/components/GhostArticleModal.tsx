import { useState, useEffect, useRef } from 'react';
import type { PendingOrderItem } from '../types/pending-order';
import { getGhostArticles, type GhostArticleSuggestion } from '../api/fresis-history';

type GhostArticleModalProps = {
  onConfirm: (item: PendingOrderItem) => void;
  onClose: () => void;
  initialSearch?: string;
};

export function GhostArticleModal({ onConfirm, onClose, initialSearch = '' }: GhostArticleModalProps) {
  const [suggestions, setSuggestions] = useState<GhostArticleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFromHistory, setSelectedFromHistory] = useState(false);

  const [articleCode, setArticleCode] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [vat, setVat] = useState<number | ''>('');
  const [vatError, setVatError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    const initialTerm = initialSearch.trim() || undefined;
    if (initialTerm) setArticleCode(initialSearch);
    getGhostArticles(initialTerm)
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleArticleCodeChange(value: string) {
    setArticleCode(value);
    setSelectedFromHistory(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      getGhostArticles(value.trim() || undefined)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 300);
  }

  function selectSuggestion(s: GhostArticleSuggestion) {
    setArticleCode(s.articleCode);
    setDescription(s.description);
    setPrice(s.price);
    setDiscount(s.discount);
    setVat(s.vat);
    setQuantity(1);
    setVatError('');
    setSelectedFromHistory(true);
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
      ghostArticleSource: selectedFromHistory ? 'history' : 'manual',
      warehouseQuantity: quantity,
      warehouseSources: [],
    };
    onConfirm(item);
  }

  const searchTerm = articleCode.trim();
  const notFoundInHistory = searchTerm.length > 0 && !selectedFromHistory && !loading && suggestions.length === 0;

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

        <div style={{ overflowY: 'auto', maxHeight: '180px', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
          {loading && <p style={{ padding: '0.75rem', color: '#6b7280', margin: 0 }}>Caricamento...</p>}
          {!loading && suggestions.length === 0 && !notFoundInHistory && (
            <p style={{ padding: '0.75rem', color: '#6b7280', margin: 0 }}>Nessun articolo non catalogato trovato nello storico.</p>
          )}
          {notFoundInHistory && (
            <p style={{ padding: '0.75rem', color: '#6b7280', margin: 0, fontStyle: 'italic' }}>
              Articolo non trovato nello storico — puoi inserirlo manualmente nel form sottostante.
            </p>
          )}
          {suggestions.map((s) => (
            <div
              key={s.articleCode}
              onClick={() => selectSuggestion(s)}
              style={{
                padding: '0.625rem 0.75rem',
                cursor: 'pointer',
                borderBottom: '1px solid #f3f4f6',
                background: articleCode === s.articleCode && selectedFromHistory ? '#eff6ff' : 'transparent',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{s.articleCode}</span>
              {' — '}
              <span style={{ color: '#374151', fontSize: '0.875rem' }}>{s.description}</span>
              <span style={{ float: 'right', color: '#6b7280', fontSize: '0.75rem' }}>×{s.occurrences}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Codice articolo *
              <input autoComplete="off"
                value={articleCode}
                onChange={(e) => handleArticleCodeChange(e.target.value)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Quantità
              <input autoComplete="off"
                type="number" min={1} value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            Descrizione
            <input autoComplete="off"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Prezzo
              <input autoComplete="off"
                type="number" min={0} step={0.01} value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              Sconto %
              <input autoComplete="off"
                type="number" min={0} max={100} value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
              IVA % *
              <input autoComplete="off"
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
