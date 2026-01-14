import { useState } from 'react';
import { PinInput } from './PinInput';

interface PinSetupWizardProps {
  onComplete: (pin: string) => Promise<void>;
  onCancel: () => void;
}

export function PinSetupWizard({ onComplete, onCancel }: PinSetupWizardProps) {
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePin = (pinValue: string): string | null => {
    if (pinValue.length !== 6) {
      return 'Il PIN deve essere di 6 cifre';
    }

    // Check for all same digit
    if (/^(\d)\1{5}$/.test(pinValue)) {
      return 'PIN troppo semplice. Scegli un PIN più sicuro.';
    }

    // Check for sequential patterns
    const sequences = ['012345', '123456', '234567', '345678', '456789', '543210', '654321'];
    if (sequences.includes(pinValue)) {
      return 'PIN sequenziale non permesso. Scegli un PIN più sicuro.';
    }

    // Check for common patterns
    const commonPatterns = ['121212', '010101', '101010', '000000', '111111', '222222'];
    if (commonPatterns.includes(pinValue)) {
      return 'PIN troppo comune. Scegli un PIN più sicuro.';
    }

    return null;
  };

  const handleCreateComplete = () => {
    setError('');
    const validationError = validatePin(pin);
    if (validationError) {
      setError(validationError);
      return;
    }
    setStep('confirm');
  };

  const handleConfirmComplete = async () => {
    setError('');

    if (confirmPin !== pin) {
      setError('I PIN non coincidono. Riprova.');
      setConfirmPin('');
      return;
    }

    setIsSubmitting(true);
    try {
      await onComplete(pin);
    } catch (err) {
      setError('Errore durante il salvataggio del PIN. Riprova.');
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setStep('create');
    setPin('');
    setConfirmPin('');
    setError('');
  };

  return (
    <div className="pin-setup-wizard-overlay">
      <div className="pin-setup-wizard">
        <div className="wizard-header">
          <h2>Configura PIN di sicurezza</h2>
          <p className="wizard-subtitle">
            {step === 'create'
              ? 'Crea un PIN di 6 cifre per proteggere le tue credenziali'
              : 'Conferma il PIN inserito'}
          </p>
        </div>

        <div className="wizard-body">
          {step === 'create' ? (
            <>
              <PinInput
                value={pin}
                onChange={setPin}
                autoFocus
              />
              <button
                onClick={handleCreateComplete}
                disabled={pin.length !== 6}
                className="wizard-button-primary"
              >
                Continua
              </button>
            </>
          ) : (
            <>
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                autoFocus
              />
              <div className="wizard-actions">
                <button onClick={handleBack} className="wizard-button-secondary">
                  Indietro
                </button>
                <button
                  onClick={handleConfirmComplete}
                  disabled={confirmPin.length !== 6 || isSubmitting}
                  className="wizard-button-primary"
                >
                  {isSubmitting ? 'Salvataggio...' : 'Conferma'}
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
