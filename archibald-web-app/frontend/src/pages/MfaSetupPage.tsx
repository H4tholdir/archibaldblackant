import { useState, useEffect } from 'react';

type Props = {
  setupToken: string;
  onComplete: () => void;
};

export function MfaSetupPage({ setupToken, onComplete }: Props) {
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [step, setStep] = useState<'loading' | 'scan' | 'confirm' | 'recovery'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/mfa-setup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${setupToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUri(data.data.uri);
          setStep('scan');
        } else {
          setError(data.error ?? 'Errore setup MFA');
        }
      })
      .catch(() => setError('Errore di connessione'));
  }, [setupToken]);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/auth/mfa-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${setupToken}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.success) {
        setRecoveryCodes(data.data.recoveryCodes);
        setStep('recovery');
      } else {
        setError(data.error ?? 'Codice non valido');
      }
    } catch {
      setError('Errore di connessione');
    }
  }

  if (step === 'loading') return <p style={{ padding: 24 }}>Caricamento...</p>;

  if (step === 'scan') return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 24 }}>
      <h2>Attiva autenticazione a due fattori</h2>
      <p>Scansiona questo URI con Google Authenticator, Authy, o 1Password:</p>
      <code style={{ wordBreak: 'break-all', display: 'block', background: '#f4f4f4', padding: 12, borderRadius: 4, fontSize: 12 }}>
        {uri}
      </code>
      <p style={{ marginTop: 16 }}>Dopo la scansione, inserisci il primo codice a 6 cifre:</p>
      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          maxLength={6}
          placeholder="000000"
          autoFocus
          style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center', padding: '12px 16px' }}
        />
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={code.length !== 6}>Conferma</button>
      </form>
    </div>
  );

  if (step === 'recovery') return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 24 }}>
      <h2>Salva i tuoi recovery codes</h2>
      <p><strong>Questi codici vengono mostrati una sola volta.</strong> Salvali in un posto sicuro (password manager).</p>
      <ul style={{ fontFamily: 'monospace', lineHeight: 2 }}>
        {recoveryCodes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <button onClick={onComplete}>Ho salvato i recovery codes — Continua</button>
    </div>
  );

  return null;
}
