import { useState, useEffect } from 'react';
import * as authApi from '../api/auth';

const TOKEN_KEY = 'archibald_jwt';
const LAST_USER_KEY = 'archibald_last_user';

export interface AuthState {
  isAuthenticated: boolean;
  user: authApi.User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  needsPinSetup: boolean;
  lastUser: { userId: string; fullName: string } | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: true,
    error: null,
    needsPinSetup: false,
    lastUser: null,
  });

  // Initialize: Check localStorage for existing JWT and lastUser
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const lastUserJson = localStorage.getItem(LAST_USER_KEY);
    const lastUser = lastUserJson ? JSON.parse(lastUserJson) : null;

    if (token) {
      // Verify token by fetching user profile
      authApi.getMe(token)
        .then(response => {
          if (response.success && response.user) {
            setState({
              isAuthenticated: true,
              user: response.user,
              token,
              isLoading: false,
              error: null,
              needsPinSetup: false,
              lastUser,
            });
          } else {
            // Token invalid, clear it
            localStorage.removeItem(TOKEN_KEY);
            setState(prev => ({ ...prev, isLoading: false, lastUser }));
          }
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setState(prev => ({ ...prev, isLoading: false, lastUser }));
        });
    } else if (lastUser) {
      // No token but have lastUser → prepare unlock flow
      setState(prev => ({ ...prev, lastUser, isLoading: false }));
    } else {
      // No token, no lastUser → standard login
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (username: string, password: string, rememberCredentials: boolean = false): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await authApi.login({ username, password });

      if (response.success && response.token && response.user) {
        localStorage.setItem(TOKEN_KEY, response.token);

        // Save lastUser for unlock flow if rememberCredentials is true
        let lastUser = null;
        if (rememberCredentials) {
          lastUser = {
            userId: response.user.id,
            fullName: response.user.fullName,
          };
          localStorage.setItem(LAST_USER_KEY, JSON.stringify(lastUser));
        }

        setState({
          isAuthenticated: true,
          user: response.user,
          token: response.token,
          isLoading: false,
          error: null,
          needsPinSetup: rememberCredentials,
          lastUser: rememberCredentials ? lastUser : null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: response.error || 'Login failed',
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Network error',
      }));
      return false;
    }
  };

  const logout = async () => {
    if (state.token) {
      await authApi.logout(state.token).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setState({
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,
      needsPinSetup: false,
      lastUser: state.lastUser,
    });
  };

  const completePinSetup = async (pin: string, username: string, password: string): Promise<void> => {
    if (!state.user) return;

    const { getCredentialStore } = await import('../services/credential-store');
    const credentialStore = getCredentialStore();
    await credentialStore.initialize();
    await credentialStore.storeCredentials(state.user.id, username, password, pin);

    setState(prev => ({ ...prev, needsPinSetup: false }));
  };

  const skipPinSetup = () => {
    setState(prev => ({ ...prev, needsPinSetup: false }));
  };

  const unlockWithPin = async (username: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Use existing login API (same as manual login)
      const response = await authApi.login({ username, password });

      if (response.success && response.token && response.user) {
        localStorage.setItem(TOKEN_KEY, response.token);
        setState({
          isAuthenticated: true,
          user: response.user,
          token: response.token,
          isLoading: false,
          error: null,
          needsPinSetup: false,
          lastUser: { userId: response.user.id, fullName: response.user.fullName },
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: response.error || 'Unlock failed',
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Network error',
      }));
      return false;
    }
  };

  const clearLastUser = async () => {
    const lastUserJson = localStorage.getItem(LAST_USER_KEY);
    if (lastUserJson) {
      const lastUser = JSON.parse(lastUserJson);

      // Delete credentials from IndexedDB
      const { getCredentialStore } = await import('../services/credential-store');
      const credStore = getCredentialStore();
      await credStore.initialize();
      await credStore.deleteCredentials(lastUser.userId);
    }

    // Clear lastUser from localStorage
    localStorage.removeItem(LAST_USER_KEY);
    setState(prev => ({ ...prev, lastUser: null }));
  };

  const switchAccount = () => {
    // Keep credentials but switch to login form
    setState(prev => ({ ...prev, lastUser: null }));
  };

  return {
    ...state,
    login,
    logout,
    completePinSetup,
    skipPinSetup,
    unlockWithPin,
    clearLastUser,
    switchAccount,
  };
}
