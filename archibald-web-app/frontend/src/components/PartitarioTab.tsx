import { useState, useEffect } from 'react';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
import { fetchCustomerLedger, fetchCustomerLedgerHistory } from '../api/customer-ledger';
import { LedgerSummary as LedgerSummaryComponent } from './LedgerSummary';
import { InvoiceCard } from './InvoiceCard';

type Props = { erpId: string };

export function PartitarioTab({ erpId }: Props) {
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [history, setHistory] = useState<LedgerInvoice[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchCustomerLedger(erpId)
      .then(setLedger)
      .catch(() => setError('Impossibile caricare il partitario'))
      .finally(() => setLoading(false));
  }, [erpId]);

  const handleShowHistory = async () => {
    if (history.length === 0) {
      const h = await fetchCustomerLedgerHistory(erpId).catch(() => []);
      setHistory(h);
    }
    setShowHistory(v => !v);
  };

  if (loading) {
    return <div style={{ padding: '16px', color: '#64748b', fontSize: '12px' }}>Caricamento partitario...</div>;
  }
  if (error || !ledger) {
    return <div style={{ padding: '16px', color: '#ef4444', fontSize: '12px' }}>{error ?? 'Errore sconosciuto'}</div>;
  }

  const nettingAmount = ledger.totalDaSaldare - ledger.totalNcAperte;

  return (
    <div style={{ padding: '12px 16px' }}>

      {ledger.blockedStatus && (
        <div style={{
          background: '#1c0a0a', border: '1px solid #ef4444', borderRadius: '10px',
          padding: '10px 12px', marginBottom: '10px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '18px' }}>💀</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#fca5a5' }}>Cliente bloccato dall&apos;ERP</div>
            <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '1px' }}>
              Ordini in lavorazione sospesi · Insoluti da {ledger.maxDaysPastDue} giorni
            </div>
          </div>
        </div>
      )}

      <LedgerSummaryComponent summary={ledger} />

      {ledger.totalNcAperte > 0 && (
        <div style={{
          background: '#1e293b', borderRadius: '8px', padding: '8px 12px',
          marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>Esposizione netta indicativa</div>
            <div style={{ fontSize: '7px', color: '#475569', fontStyle: 'italic' }}>Se applicate le NC disponibili</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(ledger.totalDaSaldare)}
              {' − '}
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(ledger.totalNcAperte)}
              {' NC ='}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f1f5f9' }}>
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(nettingAmount)}
            </div>
          </div>
        </div>
      )}

      {ledger.ncInvoices.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
              🟣 Note di credito aperte ({ledger.ncInvoices.length})
            </span>
          </div>
          {ledger.ncInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </>
      )}

      {ledger.openInvoices.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', marginTop: '10px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
              ⚠ Fatture aperte ({ledger.openInvoices.length})
            </span>
          </div>
          {ledger.openInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </>
      )}

      {ledger.openInvoices.length === 0 && ledger.ncInvoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>
          ✅ Nessuna fattura aperta
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', marginBottom: '5px' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748b' }}>
          ✅ Storico saldato
        </span>
        <button
          onClick={handleShowHistory}
          style={{ fontSize: '9px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {showHistory ? 'Nascondi ▲' : `Mostra (${history.length || '...'}) ▼`}
        </button>
      </div>
      {showHistory && history.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
      {showHistory && history.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: '9px', color: '#64748b', padding: '8px' }}>Nessuno storico disponibile</div>
      )}
    </div>
  );
}
