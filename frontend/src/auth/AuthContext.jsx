import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('rp_token'));

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('rp_token')) {
      setSession(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api.get('/auth/me');
      setSession(me);
      return me;
    } catch {
      setSession(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const authenticate = useCallback(async (path, body) => {
    const res = await api.post(path, body);
    localStorage.setItem('rp_token', res.token);
    setSession({ user: res.user, workspace: res.workspace });
    return res;
  }, []);

  const value = useMemo(() => ({
    session,
    loading,
    refresh,
    login: (body) => authenticate('/auth/login', body),
    signup: (body) => authenticate('/auth/signup', body),
    logout: () => {
      localStorage.removeItem('rp_token');
      setSession(null);
    },
  }), [session, loading, refresh, authenticate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
