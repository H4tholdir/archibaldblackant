import { useState, useEffect } from 'react';
import type { ModuleDefault, UserRole } from '../../api/module-defaults';
import { getModuleDefaults, updateModuleDefault, updateUserModules } from '../../api/module-defaults';
import { fetchWithRetry } from '../../utils/fetch-with-retry';

const KNOWN_MODULES: Array<{ name: string; label: string; description: string }> = [
  {
    name: 'discount-traffic-light',
    label: '🚦 Semaforo Sconto',
    description: 'Mostra un banner colorato durante la creazione ordine con lo stato dello sconto effettivo documento.',
  },
];

const ALL_ROLES: UserRole[] = ['agent', 'admin', 'ufficio', 'concessionario'];
const ROLE_LABELS: Record<UserRole, string> = {
  agent: 'Agent',
  admin: 'Admin',
  ufficio: 'Ufficio',
  concessionario: 'Concessionario',
};

type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  modulesGranted?: string[];
  modulesRevoked?: string[];
};

export function AdminModulesSection() {
  const [defaults, setDefaults] = useState<ModuleDefault[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      getModuleDefaults(),
      fetchWithRetry('/api/admin/users').then(r => r.json()),
    ]).then(([defs, usersData]) => {
      setDefaults(defs);
      setUsers(usersData.users ?? []);
      setLoading(false);
    });
  }, []);

  function isDefaultEnabled(moduleName: string, role: UserRole): boolean {
    return defaults.find(d => d.module_name === moduleName && d.role === role)?.enabled ?? false;
  }

  async function toggleRoleDefault(moduleName: string, role: UserRole, currentEnabled: boolean) {
    const key = `${moduleName}-${role}`;
    setSaving(key);
    try {
      await updateModuleDefault(moduleName, role, !currentEnabled);
      setDefaults(prev => prev.map(d =>
        d.module_name === moduleName && d.role === role ? { ...d, enabled: !currentEnabled } : d
      ));
    } finally {
      setSaving(null);
    }
  }

  async function toggleUserOverride(
    user: AdminUser,
    moduleName: string,
    currentlyRevoked: boolean,
  ) {
    setSaving(`user-${user.id}-${moduleName}`);
    const granted = user.modulesGranted ?? [];
    const revoked = user.modulesRevoked ?? [];

    const newRevoked = currentlyRevoked
      ? revoked.filter(m => m !== moduleName)
      : [...revoked, moduleName];
    const newGranted = granted.filter(m => m !== moduleName);

    try {
      await updateUserModules(user.id, newGranted, newRevoked);
      setUsers(prev => prev.map(u =>
        u.id === user.id ? { ...u, modulesGranted: newGranted, modulesRevoked: newRevoked } : u
      ));
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', color: '#9ca3af' }}>Caricamento moduli...</div>;
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>
        Gestione Moduli
      </h3>

      {KNOWN_MODULES.map(mod => (
        <div
          key={mod.name}
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '1rem',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', background: '#f3f4f6' }}>
            <div style={{ fontWeight: 700 }}>{mod.label}</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.2rem' }}>{mod.description}</div>
          </div>

          {/* Tabella ruoli */}
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Default per ruolo
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              {ALL_ROLES.map(role => {
                const enabled = isDefaultEnabled(mod.name, role);
                const key = `${mod.name}-${role}`;
                return (
                  <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={saving === key}
                      onChange={() => { void toggleRoleDefault(mod.name, role, enabled); }}
                    />
                    <span style={{ fontSize: '0.875rem' }}>{ROLE_LABELS[role]}</span>
                    {enabled
                      ? <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>ON</span>
                      : <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>OFF</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.5rem' }}>
              ⚠️ Il cambio di default si applica al prossimo login degli utenti del ruolo (fino a 8h).
            </div>
          </div>

          {/* Override per utente */}
          <div style={{ padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Override per utente (cambio immediato → forza logout)
            </div>
            {users.map(user => {
              const revoked = user.modulesRevoked ?? [];
              const isRevoked = revoked.includes(mod.name);
              const roleDefault = isDefaultEnabled(mod.name, user.role);
              const savingKey = `user-${user.id}-${mod.name}`;
              return (
                <div
                  key={user.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.4rem 0',
                    borderBottom: '1px solid #f3f4f6',
                    gap: '0.75rem',
                  }}
                >
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>{user.fullName}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{ROLE_LABELS[user.role]}</span>
                  {!isRevoked ? (
                    <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                      {roleDefault ? 'Eredita default ✓' : 'Grant esplicito'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>Revocato</span>
                  )}
                  <button
                    disabled={saving === savingKey}
                    onClick={() => { void toggleUserOverride(user, mod.name, isRevoked); }}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {saving === savingKey ? '...' : isRevoked ? 'Ripristina' : 'Revoca'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
