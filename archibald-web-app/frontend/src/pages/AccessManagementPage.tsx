import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

type WhitelistUser = {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'agent' | 'ufficio' | 'concessionario';
  modules: string[];
  mfaEnabled: boolean;
  whitelisted: boolean;
};

const ALL_MODULES = ['orders', 'customers', 'warehouse', 'history', 'admin', 'arca', 'fresis'];

export function AccessManagementPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { setUsers(data.users ?? []); setLoading(false); });
  }, [token]);

  async function updateUser(userId: string, changes: Partial<Pick<WhitelistUser, 'role' | 'modules' | 'whitelisted'>>) {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(changes),
    });
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...changes } : u));
  }

  if (loading) return <p>Caricamento...</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Gestione accessi</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Utente ERP</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Ruolo</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Moduli</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>MFA</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Accesso</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: '8px 12px' }}>
                <strong>{user.username}</strong><br />
                <small>{user.fullName}</small>
              </td>
              <td style={{ padding: '8px 12px' }}>
                <select
                  value={user.role}
                  onChange={(e) => updateUser(user.id, { role: e.target.value as WhitelistUser['role'] })}
                >
                  <option value="agent">Agente</option>
                  <option value="ufficio">Ufficio</option>
                  <option value="concessionario">Concessionario</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {ALL_MODULES.map((mod) => (
                  <label key={mod} style={{ display: 'block', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={user.modules.includes(mod)}
                      onChange={(e) => {
                        const updated = e.target.checked
                          ? [...user.modules, mod]
                          : user.modules.filter((m) => m !== mod);
                        updateUser(user.id, { modules: updated });
                      }}
                    /> {mod}
                  </label>
                ))}
              </td>
              <td style={{ padding: '8px 12px' }}>
                {user.mfaEnabled ? 'Attivo' : 'Non attivo'}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <button
                  onClick={() => updateUser(user.id, { whitelisted: !user.whitelisted })}
                  style={{ color: user.whitelisted ? 'red' : 'green' }}
                >
                  {user.whitelisted ? 'Revoca' : 'Riattiva'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
