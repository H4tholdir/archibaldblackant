import { useState, useEffect } from 'react';
import { PinInput } from './PinInput';

interface UnlockScreenProps {
  userId: string;
  fullName: string;
  onUnlock: (username: string, password: string) => Promise<boolean>;
  onForgotPin: () => void;
  onSwitchAccount: () => void;
}

export function UnlockScreen({
  userId,
  fullName,
  onUnlock,
  onForgotPin,
  onSwitchAccount,
}: UnlockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    // Auto-submit when PIN complete
    if (pin.length === 6 && !isUnlocking) {
      handleUnlock();
    }
  }, [pin]);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    setError('');

    try {
      // Import CredentialStore
      const { getCredentialStore } = await import('../services/credential-store');
      const credStore = getCredentialStore();
      await credStore.initialize();

      // Decrypt credentials with PIN
      const credentials = await credStore.getCredentials(userId, pin);

      if (!credentials) {
        // Wrong PIN or decryption failed
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= 3) {
          setError('Troppi tentativi errati. Usa "PIN dimenticato?" per reimpostare.');
        } else if (newAttempts === 2) {
          setError('PIN errato. Ultimo tentativo rimanente.');
        } else {
          setError('PIN errato. Riprova.');
        }

        setPin('');
        setIsUnlocking(false);
        return;
      }

      // Credentials decrypted, attempt auto-login
      const loginSuccess = await onUnlock(credentials.username, credentials.password);

      if (!loginSuccess) {
        setError('Errore durante il login. Verifica la connessione.');
        setPin('');
        setIsUnlocking(false);
        return;
      }

      // Success - onUnlock handles navigation
    } catch (err) {
      setError('Errore imprevisto. Riprova.');
      setPin('');
      setIsUnlocking(false);
    }
  };

  return (
    <div className="unlock-screen">
      <div className="unlock-container">
        <div className="unlock-logo">
          {/* App logo placeholder */}
          <div className="logo-circle">A</div>
        </div>

        <div className="unlock-greeting">
          <h2>Bentornato, {fullName.split(' ')[0]}!</h2>
          <p className="unlock-subtitle">Inserisci il PIN per accedere</p>
        </div>

        <div className="unlock-pin-area">
          <PinInput
            value={pin}
            onChange={setPin}
            autoFocus
          />
        </div>

        {error && <div className="unlock-error">{error}</div>}

        {isUnlocking && (
          <div className="unlock-loading">Accesso in corso...</div>
        )}

        <div className="unlock-actions">
          <button
            onClick={onForgotPin}
            className="unlock-link"
            disabled={isUnlocking}
          >
            PIN dimenticato?
          </button>

          <button
            onClick={onSwitchAccount}
            className="unlock-link"
            disabled={isUnlocking}
          >
            Usa un altro account
          </button>
        </div>
      </div>
    </div>
  );
}
