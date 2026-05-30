import { useState, useEffect } from 'react';
import type { LedgerSummary, LedgerInvoice } from '../types/customer-ledger';
import { fetchCustomerLedger, fetchCustomerLedgerHistory } from '../api/customer-ledger';
import { LedgerSummary as LedgerSummaryComponent } from './LedgerSummary';
import { InvoiceCard } from './InvoiceCard';

function formatEur(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

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
    if (!showHistory && history.length === 0) {
      const h = await fetchCustomerLedgerHistory(erpId).catch(() => []);
      setHistory(h);
    }
    setShowHistory(v => !v);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
        Caricamento partitario...
      </div>
    );
  }

  if (error || !ledger) {
    return (
      <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', fontSize: '13px' }}>
        {error ?? 'Errore caricamento dati'}
      </div>
    );
  }

  const nettingAmount = ledger.totalDaSaldare - ledger.totalNcAperte;

  return (
    <div>
      {/* Banner cliente bloccato */}
      {ledger.blockedStatus && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🚫</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
              Cliente bloccato dall&apos;ERP · {ledger.blockedStatus}
            </div>
            <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
              Ordini sospesi · {ledger.maxDaysPastDue} giorni di insoluto
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <LedgerSummaryComponent summary={ledger} />

      {/* Netting NC */}
      {ledger.totalNcAperte > 0 && (
        <div style={{
          background: '#f5f3ff',
          border: '1px solid #e9d5ff',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#7c3aed' }}>Esposizione netta indicativa</div>
            <div style={{ fontSize: '11px', color: '#9333ea', marginTop: '2px', fontStyle: 'italic' }}>
              Se le note di credito venissero applicate
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {formatEur(ledger.totalDaSaldare)} − {formatEur(ledger.totalNcAperte)} NC
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed' }}>
              {formatEur(nettingAmount)}
            </div>
          </div>
        </div>
      )}

      {/* Note di credito */}
      {ledger.ncInvoices.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '6px' }}>
            Note di credito aperte ({ledger.ncInvoices.length})
          </div>
          {ledger.ncInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </div>
      )}

      {/* Fatture aperte */}
      {ledger.openInvoices.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b', marginBottom: '6px' }}>
            Fatture aperte ({ledger.openInvoices.length})
          </div>
          {ledger.openInvoices.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)}
        </div>
      )}

      {ledger.openInvoices.length === 0 && ledger.ncInvoices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
          ✅ Nessuna fattura aperta
        </div>
      )}

      {/* Storico saldato */}
      <div style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#64748b' }}>
            Storico saldato
          </div>
          <button
            onClick={handleShowHistory}
            style={{
              fontSize: '12px', fontWeight: 600, color: '#2563eb',
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            {showHistory ? 'Nascondi ▲' : `Mostra${history.length > 0 ? ` (${history.length})` : ''} ▼`}
          </button>
        </div>

        {showHistory && (
          <>
            {history.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', padding: '8px 0' }}>
                Nessuna fattura saldato disponibile
              </div>
            ) : (
              history.map(i => <InvoiceCard key={i.invoiceNumber} invoice={i} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
