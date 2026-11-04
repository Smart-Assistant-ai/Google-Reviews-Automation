import type { Me, SessionResponse, WorkspaceSummary } from '@replypilot/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../api/client';

interface AuthValue {
  session: Me | null;
  loading: boolean;
  workspace: WorkspaceSummary | null;
  switchWorkspace: (id: string) => void;
  login: (body: { email: string; password: string }) => Promise<SessionResponse>;
  signup: (body: object) => Promise<SessionResponse>;
  logout: () => Promise<void>;
  reload: () => Promise<Me | null>;
  restore: () => Promise<Me | null>;
  clearLocal: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

// Only remembers which workspace was open. It's a convenience, so losing it is harmless.
const WORKSPACE_KEY = 'rp_workspace';

function storedWorkspace(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(storedWorkspace);
  const queryClient = useQueryClient();

  const clearLocal = useCallback(() => {
    setAccessToken(null);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  // A page load has no access token, so ask for one using the cookie.
  const restore = useCallback(async () => {
    try {
      const res = await refreshSession();
      const me = { user: res.user, workspaces: res.workspaces };
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
    setSessionLostHandler(clearLocal);
    void restore();
  }, [restore, clearLocal]);

  const accept = useCallback((res: SessionResponse) => {
    setAccessToken(res.accessToken);
    setSession({ user: res.user, workspaces: res.workspaces });
    return res;
  }, []);

  const reload = useCallback(async () => {
    const me = await api.get<Me>('/auth/me');
    setSession(me);
    return me;
  }, []);

  const workspace = useMemo(() => {
    if (!session) return null;
    return session.workspaces.find((w) => w.id === workspaceId) ?? session.workspaces[0] ?? null;
  }, [session, workspaceId]);

  const switchWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    try {
      localStorage.setItem(WORKSPACE_KEY, id);
    } catch {
      // Remembering is optional.
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      workspace,
      switchWorkspace,
      reload,
      restore,
      clearLocal,
      login: async (body) => accept(await api.post<SessionResponse>('/auth/login', body)),
      signup: async (body) => accept(await api.post<SessionResponse>('/auth/signup', body)),
      logout: async () => {
        await api.post('/auth/logout').catch(() => {});
        clearLocal();
      },
    }),
    [session, loading, workspace, switchWorkspace, reload, restore, clearLocal, accept],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
