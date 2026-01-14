import { useState } from 'react';

interface LoginModalProps {
  onLogin: (username: string, password: string, rememberCredentials: boolean) => Promise<boolean>;
  error: string | null;
  isLoading: boolean;
}

export function LoginModal({ onLogin, error, isLoading }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberCredentials, setRememberCredentials] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password, rememberCredentials);
  };

  return (
    <div className="login-modal-overlay">
      <div className="login-modal">
        <h1>🐜 Archibald Black Ant</h1>
        <p className="subtitle">Accedi con le tue credenziali Archibald</p>

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
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
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

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading || !username || !password}
          >
            {isLoading ? 'Autenticazione...' : 'Accedi'}
          </button>
        </form>

        <p className="help-text">
          Usa le stesse credenziali che usi per accedere al sito Archibald.
        </p>
      </div>
    </div>
  );
}
