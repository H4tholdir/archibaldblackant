import { useState } from 'react';
import { getDeviceId } from '../utils/device-id';

type Props = {
  mfaToken: string;
  onSuccess: (token: string, user: { id: string; username: string; fullName: string; role: string }) => void;
  onCancel: () => void;
};

export function MfaVerifyStep({ mfaToken, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/mfa-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code, rememberDevice, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.trustToken) {
          localStorage.setItem('archibald_mfa_trust', data.trustToken);
        }
        onSuccess(data.token, data.user);
      } else {
        setError(data.error ?? 'Codice non valido');
      }
    } catch {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0 }}>
        Inserisci il codice a 6 cifre dall'app di autenticazione (o un recovery code da 16 caratteri).
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        maxLength={16}
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', padding: '12px 16px' }}
        autoFocus
      />
      {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
        />
        Ricorda questo dispositivo per 30 giorni
      </label>
      <button type="submit" disabled={loading || code.length < 6}>
        {loading ? 'Verifica...' : 'Verifica'}
      </button>
      <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        Torna al login
      </button>
    </form>
  );
}
