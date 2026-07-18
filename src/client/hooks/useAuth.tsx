import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api.js';

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  csrfToken: string;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [csrfToken, setCsrfToken] = useState('');

  useEffect(() => {
    void api.authState().then((state) => {
      setAuthenticated(state.authenticated);
      setCsrfToken(state.csrfToken ?? '');
    }).finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    authenticated,
    csrfToken,
    login: async (password) => {
      const state = await api.login(password);
      setAuthenticated(true);
      setCsrfToken(state.csrfToken ?? '');
    },
    logout: async () => {
      await api.logout(csrfToken);
      setAuthenticated(false);
      setCsrfToken('');
    },
  }), [loading, authenticated, csrfToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return context;
}
