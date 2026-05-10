import type { Customer } from '../types/customer';

type Props = { customer: Customer };

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Gestisce sia "2027-02-07" che "2027-02-07T00:00:00.000Z" (pg restituisce DATE come Date object)
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function ExclusivityBadge({ days, endDate }: { days: number; endDate: string | null | undefined }) {
  const isExpiringSoon = days <= 30;
  const isWarning = days <= 90;
  const bg = isExpiringSoon ? '#fef2f2' : isWarning ? '#fffbeb' : '#f0fdf4';
  const border = isExpiringSoon ? '#fca5a5' : isWarning ? '#fcd34d' : '#86efac';
  const text = isExpiringSoon ? '#991b1b' : isWarning ? '#92400e' : '#166534';
  const label = isExpiringSoon
    ? `Esclusività in scadenza (${days}gg)`
    : `Esclusività attiva — ${days} giorni`;

  return (
    <div
      data-testid="exclusivity-badge"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: bg, border: `1px solid ${border}`, borderRadius: 8,
        padding: '5px 10px', fontSize: 12, fontWeight: 600, color: text,
      }}
    >
      <span>{isExpiringSoon ? '⚠️' : '🛡️'}</span>
      <span>{label}</span>
      {endDate && <span style={{ opacity: 0.8 }}>fino al {formatDate(endDate)}</span>}
    </div>
  );
}

function CustomerStoricoCRMSection({ customer }: Props) {
  const hasExclusivity = (customer.exclusivityDaysRemaining ?? 0) > 0;
  const hasCRM = !!(customer.crmAccountCommercial || customer.crmContactType);
  const hasGeo = !!(customer.geoLatitude && customer.geoLongitude &&
    customer.geoLatitude !== 0 && customer.geoLongitude !== 0);

  if (!hasExclusivity && !hasCRM && !hasGeo) return null;

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#475569',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    marginBottom: 8,
  };

  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#94a3b8', marginBottom: 2 };
  const valueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a' };
  const cardStyle: React.CSSProperties = {
    background: '#fafafa', border: '1px solid #e8eef4',
    borderRadius: 12, padding: '12px 14px', marginBottom: 10,
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Badge esclusività */}
      {hasExclusivity && (
        <div style={{ ...cardStyle, marginBottom: 8 }}>
          <div style={sectionTitleStyle}>Esclusività Komet</div>
          <ExclusivityBadge
            days={customer.exclusivityDaysRemaining!}
            endDate={customer.exclusivityEndDate}
          />
          {(customer.exclusivitySalesForecast != null || customer.exclusivitySalesActual != null) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <div>
                <div style={labelStyle}>Previsione</div>
                <div style={valueStyle}>{formatCurrency(customer.exclusivitySalesForecast)}</div>
              </div>
              <div>
                <div style={labelStyle}>Realizzato</div>
                <div style={valueStyle}>{formatCurrency(customer.exclusivitySalesActual)}</div>
              </div>
              {customer.exclusivityStartDate && (
                <div>
                  <div style={labelStyle}>Inizio</div>
                  <div style={valueStyle}>{formatDate(customer.exclusivityStartDate)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info CRM */}
      {hasCRM && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>CRM</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {customer.crmAccountCommercial && (
              <div>
                <div style={labelStyle}>Account commerciale</div>
                <div style={valueStyle}>{customer.crmAccountCommercial}</div>
              </div>
            )}
            {customer.crmContactType && (
              <div>
                <div style={labelStyle}>Tipo contatto</div>
                <div style={valueStyle}>{customer.crmContactType}</div>
              </div>
            )}
            {customer.crmOldRefId && (
              <div>
                <div style={labelStyle}>Rif. vecchio CRM</div>
                <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 12 }}>
                  {customer.crmOldRefId}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Geo */}
      {hasGeo && (
        <div style={{ marginTop: 4 }}>
          <a
            href={`https://maps.google.com/?q=${customer.geoLatitude},${customer.geoLongitude}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 600,
            }}
          >
            📍 Vedi su mappa
          </a>
        </div>
      )}
    </div>
  );
}

export { CustomerStoricoCRMSection };
