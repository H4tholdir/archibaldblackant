import { useState, useEffect } from "react";
import { PinInput } from "./PinInput";
import { getBiometricAuth } from "../services/biometric-auth";
import { getCredentialStore } from "../services/credential-store";

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
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [showPinInput, setShowPinInput] = useState(false); // PIN fallback toggle
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("");

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      const bioAuth = getBiometricAuth();
      const capability = await bioAuth.checkAvailability();

      if (capability.available) {
        // Also check if user has biometric registered
        const credStore = getCredentialStore();
        await credStore.initialize();
        const hasBio = await credStore.hasBiometricCredential(userId);

        if (hasBio) {
          setBiometricAvailable(true);
          setBiometricLabel(capability.platformLabel);
        } else {
          // Biometric supported but not registered → show PIN only
          setShowPinInput(true);
        }
      } else {
        // Biometric not supported → show PIN only
        setShowPinInput(true);
      }
    };

    checkBiometric();
  }, [userId]);

  const handleBiometricUnlock = async () => {
    setIsUnlocking(true);
    setError("");

    try {
      const credStore = getCredentialStore();
      await credStore.initialize();

      // Attempt biometric unlock
      const credentials = await credStore.getCredentialsWithBiometric(userId);

      if (!credentials) {
        // Biometric failed → show PIN fallback
        setError("Autenticazione biometrica fallita. Usa il PIN.");
        setShowPinInput(true);
        setIsUnlocking(false);
        return;
      }

      // Credentials decrypted, attempt auto-login
      const loginSuccess = await onUnlock(
        credentials.username,
        credentials.password,
      );

      if (!loginSuccess) {
        setError("Errore durante il login. Verifica la connessione.");
        setShowPinInput(true);
        setIsUnlocking(false);
        return;
      }

      // Success
    } catch (err) {
      setError("Errore imprevisto. Usa il PIN.");
      setShowPinInput(true);
      setIsUnlocking(false);
    }
  };

  const handlePinUnlock = async () => {
    // Existing PIN unlock logic from Plan 07-04
    setIsUnlocking(true);
    setError("");

    try {
      const credStore = getCredentialStore();
      await credStore.initialize();

      const credentials = await credStore.getCredentials(userId, pin);

      if (!credentials) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= 3) {
          setError(
            'Troppi tentativi errati. Usa "PIN dimenticato?" per reimpostare.',
          );
        } else if (newAttempts === 2) {
          setError("PIN errato. Ultimo tentativo rimanente.");
        } else {
          setError("PIN errato. Riprova.");
        }

        setPin("");
        setIsUnlocking(false);
        return;
      }

      const loginSuccess = await onUnlock(
        credentials.username,
        credentials.password,
      );

      if (!loginSuccess) {
        setError("Errore durante il login. Verifica la connessione.");
        setPin("");
        setIsUnlocking(false);
        return;
      }
    } catch (err) {
      setError("Errore imprevisto. Riprova.");
      setPin("");
      setIsUnlocking(false);
    }
  };

  // Auto-submit PIN when complete
  useEffect(() => {
    if (pin.length === 4 && !isUnlocking && showPinInput) {
      handlePinUnlock();
    }
  }, [pin]);

  return (
    <div className="unlock-screen">
      <div className="unlock-container">
        <div className="unlock-logo">
          <div className="logo-circle">A</div>
        </div>

        <div className="unlock-greeting">
          <h2>Bentornato, {fullName.split(" ")[0]}!</h2>
          <p className="unlock-subtitle">
            {biometricAvailable && !showPinInput
              ? `Sblocca con ${biometricLabel}`
              : "Inserisci il PIN per accedere"}
          </p>
        </div>

        {/* Biometric Button (mobile only, when available and not in PIN fallback) */}
        {biometricAvailable && !showPinInput && (
          <div className="biometric-area">
            <button
              onClick={handleBiometricUnlock}
              disabled={isUnlocking}
              className="biometric-button"
            >
              🔓 Sblocca con {biometricLabel}
            </button>

            <div className="unlock-divider">
              <span>oppure</span>
            </div>

            <button
              onClick={() => setShowPinInput(true)}
              disabled={isUnlocking}
              className="use-pin-button"
            >
              Usa PIN
            </button>
          </div>
        )}

        {/* PIN Input (always available when showPinInput=true or no biometric) */}
        {showPinInput && (
          <div className="unlock-pin-area">
            <PinInput value={pin} onChange={setPin} autoFocus length={4} />
          </div>
        )}

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
