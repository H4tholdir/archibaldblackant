import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type Props = {
  setupToken: string;
  onComplete: () => void;
  completeLabel?: string;
};

export function MfaSetupPage({ setupToken, onComplete, completeLabel = 'Continua' }: Props) {
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
      <p>Scansiona il codice QR con Google Authenticator, Authy o 1Password:</p>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
        <QRCodeSVG value={uri} size={200} />
      </div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Oppure inserisci manualmente l'URI:&nbsp;
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(uri)}
          style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', borderRadius: 4, border: '1px solid #ccc', background: '#f5f5f5' }}
        >
          Copia
        </button>
      </p>
      <p>Dopo la scansione, inserisci il primo codice a 6 cifre:</p>
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
      <button onClick={onComplete}>Ho salvato i recovery codes — {completeLabel}</button>
    </div>
  );

  return null;
}
