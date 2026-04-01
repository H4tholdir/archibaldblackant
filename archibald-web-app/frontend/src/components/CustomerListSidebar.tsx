import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import { avatarGradient, customerInitials } from '../utils/customer-avatar';

interface Props {
  activeErpId?: string;
  width?: number;
}

export function CustomerListSidebar({ activeErpId, width = 240 }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);

  const loadCustomers = useCallback(async () => {
    const token = localStorage.getItem('archibald_jwt');
    if (!token) return;
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    params.append('limit', '50');
    const res = await fetch(`/api/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const body = await res.json();
    if (body.success) setCustomers(body.data.customers);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadCustomers, 300);
    return () => clearTimeout(t);
  }, [loadCustomers]);

  return (
    <div style={{ width, borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
        <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
          Clienti
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 8, padding: '6px 10px' }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 11, color: '#374151', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {customers.map(c => {
          const isActive = c.erpId === activeErpId;
          return (
            <div
              key={c.erpId}
              data-customer-row=""
              onClick={() => navigate(`/customers/${c.erpId}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: isActive ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8fafc' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarGradient(c.erpId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {customerInitials(c.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                {c.city && <div style={{ fontSize: 10, color: '#64748b' }}>{c.city}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
