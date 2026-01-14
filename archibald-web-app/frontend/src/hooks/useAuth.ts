import { useState, useEffect } from 'react';
import * as authApi from '../api/auth';

const TOKEN_KEY = 'archibald_jwt';

export interface AuthState {
  isAuthenticated: boolean;
  user: authApi.User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: true,
    error: null,
  });

  // Initialize: Check localStorage for existing JWT
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
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
            });
          } else {
            // Token invalid, clear it
            localStorage.removeItem(TOKEN_KEY);
            setState(prev => ({ ...prev, isLoading: false }));
          }
        })
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setState(prev => ({ ...prev, isLoading: false }));
        });
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await authApi.login({ username, password });

      if (response.success && response.token && response.user) {
        localStorage.setItem(TOKEN_KEY, response.token);
        setState({
          isAuthenticated: true,
          user: response.user,
          token: response.token,
          isLoading: false,
          error: null,
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
    });
  };

  return {
    ...state,
    login,
    logout,
  };
}
