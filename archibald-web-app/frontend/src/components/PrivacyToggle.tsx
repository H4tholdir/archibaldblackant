import { usePrivacy } from "../contexts/PrivacyContext";

/**
 * Privacy Toggle Component
 * Styled toggle switch based on https://uiverse.io/njesenberger/rude-stingray-22
 */

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className = "" }: PrivacyToggleProps) {
  const { privacyEnabled, togglePrivacy, isLoading } = usePrivacy();

  const handleToggle = async () => {
    await togglePrivacy();
  };

  return (
    <div className={`privacy-toggle-container ${className}`}>
      <label className="privacy-toggle-label">
        <span className="privacy-toggle-text">Attiva Privacy</span>
        <input
          type="checkbox"
          className="privacy-toggle-checkbox"
          checked={privacyEnabled}
          onChange={handleToggle}
          disabled={isLoading}
        />
        <div className="privacy-toggle-switch">
          <span className="privacy-toggle-slider"></span>
        </div>
      </label>
    </div>
  );
}
