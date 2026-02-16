import { useState, useEffect } from "react";
import { PinInput } from "./PinInput";
import { getBiometricAuth } from "../services/biometric-auth";

interface PinSetupWizardProps {
  userId: string;
  username: string;
  onComplete: (pin: string, biometricCredentialId?: string) => Promise<void>;
  onCancel: () => void;
}

export function PinSetupWizard({
  userId,
  username,
  onComplete,
  onCancel,
}: PinSetupWizardProps) {
  const [step, setStep] = useState<"create" | "confirm" | "biometric">(
    "create",
  );
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("");
  const [isRegisteringBiometric, setIsRegisteringBiometric] = useState(false);

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      const bioAuth = getBiometricAuth();
      const capability = await bioAuth.checkAvailability();
      setBiometricLabel(capability.platformLabel);
    };
    checkBiometric();
    // Always start with PIN creation (biometric is optional AFTER PIN)
    setStep("create");
  }, []);

  const validatePin = (pinValue: string): string | null => {
    if (pinValue.length !== 4) {
      return "Il PIN deve essere di 4 cifre";
    }

    // Check for all same digit
    if (/^(\d)\1{3}$/.test(pinValue)) {
      return "PIN troppo semplice. Scegli un PIN più sicuro.";
    }

    // Check for sequential patterns
    const sequences = [
      "0123",
      "1234",
      "2345",
      "3456",
      "4567",
      "5678",
      "6789",
      "3210",
      "4321",
      "5432",
      "6543",
      "7654",
      "8765",
      "9876",
    ];
    if (sequences.includes(pinValue)) {
      return "PIN sequenziale non permesso. Scegli un PIN più sicuro.";
    }

    // Check for common patterns
    const commonPatterns = [
      "1212",
      "0101",
      "1010",
      "0000",
      "1111",
      "2222",
      "3333",
      "4444",
      "5555",
      "6666",
      "7777",
      "8888",
      "9999",
    ];
    if (commonPatterns.includes(pinValue)) {
      return "PIN troppo comune. Scegli un PIN più sicuro.";
    }

    return null;
  };

  const handleCreateComplete = () => {
    setError("");
    const validationError = validatePin(pin);
    if (validationError) {
      setError(validationError);
      return;
    }
    setStep("confirm");
  };

  const handleConfirmComplete = async () => {
    setError("");

    if (confirmPin !== pin) {
      setError("I PIN non coincidono. Riprova.");
      setConfirmPin("");
      return;
    }

    // Check if biometric is available before completing
    const bioAuth = getBiometricAuth();
    const capability = await bioAuth.checkAvailability();

    if (capability.available) {
      // Biometric available → show biometric setup step
      setBiometricLabel(capability.platformLabel);
      setStep("biometric");
    } else {
      // No biometric → complete PIN setup directly
      setIsSubmitting(true);
      try {
        await onComplete(pin);
      } catch (err) {
        setError("Errore durante il salvataggio del PIN. Riprova.");
        setIsSubmitting(false);
      }
    }
  };

  const handleEnableBiometric = async () => {
    setError("");
    setIsRegisteringBiometric(true);

    try {
      const bioAuth = getBiometricAuth();
      const credentialId = await bioAuth.registerCredential(userId, username);

      if (!credentialId) {
        throw new Error("Registrazione biometrica fallita");
      }

      setIsSubmitting(true);
      await onComplete(pin, credentialId);
    } catch (err: any) {
      console.error("Biometric registration error:", err);
      setError(
        err.message === "Registrazione biometrica fallita"
          ? "Impossibile abilitare la biometria. Puoi comunque usare il PIN."
          : "Errore durante la registrazione biometrica.",
      );
      setIsRegisteringBiometric(false);
    }
  };

  const handleSkipBiometric = async () => {
    setError("");
    setIsSubmitting(true);
    try {
      await onComplete(pin);
    } catch (err) {
      setError("Errore durante il salvataggio del PIN. Riprova.");
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === "biometric") {
      setStep("confirm");
    } else {
      setStep("create");
      setPin("");
      setConfirmPin("");
    }
    setError("");
  };

  return (
    <div className="pin-setup-wizard-overlay">
      <div className="pin-setup-wizard">
        <div className="wizard-header">
          <h2>Configura accesso sicuro</h2>
          <p className="wizard-subtitle">
            {step === "create"
              ? "Crea un PIN di 4 cifre per proteggere le tue credenziali"
              : step === "confirm"
                ? "Conferma il PIN inserito"
                : step === "biometric"
                  ? `Abilita ${biometricLabel} per sblocco rapido (opzionale)`
                  : ""}
          </p>
        </div>

        <div className="wizard-body">
          {step === "create" && (
            <>
              <PinInput value={pin} onChange={setPin} autoFocus length={4} />
              <button
                onClick={handleCreateComplete}
                disabled={pin.length !== 4}
                className="wizard-button-primary"
              >
                Continua
              </button>
            </>
          )}

          {step === "confirm" && (
            <>
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                autoFocus
                length={4}
              />
              <div className="wizard-actions">
                <button
                  onClick={handleBack}
                  className="wizard-button-secondary"
                >
                  Indietro
                </button>
                <button
                  onClick={handleConfirmComplete}
                  disabled={confirmPin.length !== 4 || isSubmitting}
                  className="wizard-button-primary"
                >
                  {isSubmitting ? "Salvataggio..." : "Conferma"}
                </button>
              </div>
            </>
          )}

          {step === "biometric" && (
            <>
              <div className="biometric-setup-info">
                <div className="biometric-icon">🔐</div>
                <p className="biometric-description">
                  Sblocca velocemente l'app con {biometricLabel}. Potrai sempre
                  usare il PIN come alternativa.
                </p>
              </div>

              <div className="wizard-actions-vertical">
                <button
                  onClick={handleEnableBiometric}
                  disabled={isRegisteringBiometric || isSubmitting}
                  className="wizard-button-primary"
                >
                  {isRegisteringBiometric
                    ? `⏳ Attivando ${biometricLabel}...`
                    : `✓ Abilita ${biometricLabel}`}
                </button>
                <button
                  onClick={handleSkipBiometric}
                  disabled={isRegisteringBiometric || isSubmitting}
                  className="wizard-button-secondary"
                >
                  {isSubmitting ? "Completamento..." : "Salta (usa solo PIN)"}
                </button>
              </div>
            </>
          )}

          {error && <div className="wizard-error">{error}</div>}
        </div>

        <button onClick={onCancel} className="wizard-close" aria-label="Chiudi">
          ✕
        </button>
      </div>
    </div>
  );
}
