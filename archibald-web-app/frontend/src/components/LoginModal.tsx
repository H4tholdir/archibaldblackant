import { useState } from "react";

interface LoginModalProps {
  onLogin: (
    username: string,
    password: string,
    rememberCredentials: boolean,
  ) => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}

export function LoginModal({ onLogin, error, isLoading }: LoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password, rememberCredentials);
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-modal">
        <img src="/logo.png" alt="Formicanera" className="login-modal-logo" />
        <h1>🐜 Formicanera</h1>
        <p className="subtitle">
          Archibald Rework - Accedi con le tue credenziali
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                aria-label={
                  showPassword ? "Nascondi password" : "Mostra password"
                }
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>

          <div className="remember-credentials">
            <label>
              <input
                type="checkbox"
                checked={rememberCredentials}
                onChange={(e) => setRememberCredentials(e.target.checked)}
                disabled={isLoading}
              />
              <span>Ricorda credenziali su questo device</span>
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || !username || !password}
          >
            {isLoading ? "Autenticazione..." : "Accedi"}
          </button>
        </form>

        <p className="help-text">
          Usa le stesse credenziali che usi per accedere al sito Archibald.
        </p>
      </div>
    </div>
  );
}
