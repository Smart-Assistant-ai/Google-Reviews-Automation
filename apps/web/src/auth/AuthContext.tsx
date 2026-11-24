import type { Me, SessionResponse, WorkspaceSummary } from '@replypilot/shared';
import { Snackbar } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  // Ends the session here and in every other tab of the app open on this device.
  endSession: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

// Only remembers which workspace was open. It's a convenience, so losing it is harmless.
const WORKSPACE_KEY = 'rp_workspace';

// Tabs keep the session in memory, so a tab only finds out about a logout elsewhere on its next
// request. This channel tells every tab on the device straight away.
const LOGOUT_CHANNEL = 'replypilot-logout';

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
  // Counts how often the session has ended here. A request that started before a logout, in this
  // tab or another, mustn't bring the session back when its answer arrives.
  const sessionEnds = useRef(0);
  // Shown wherever "Log out" was clicked, since the app has several of those buttons.
  const [logoutError, setLogoutError] = useState('');

  const clearLocal = useCallback(() => {
    sessionEnds.current += 1;
    setAccessToken(null);
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  // Browsers only. Node has BroadcastChannel too, and an open one would keep the build, which
  // renders the public pages in Node, from ever finishing.
  const [channel] = useState(() =>
    typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel(LOGOUT_CHANNEL),
  );
  useEffect(() => {
    if (!channel) return;
    channel.onmessage = () => clearLocal();
    return () => {
      channel.onmessage = null;
    };
  }, [channel, clearLocal]);
  // Only a deliberate logout is shared. A refresh that fails, maybe on a bad connection, stays in
  // its own tab.
  const endSession = useCallback(() => {
    clearLocal();
    channel?.postMessage('logged-out');
  }, [channel, clearLocal]);

  // A page load has no access token, so ask for one using the cookie.
  const restore = useCallback(async () => {
    try {
      const endsBefore = sessionEnds.current;
      const res = await refreshSession();
      const me = { user: res.user, workspaces: res.workspaces };
      // A token that came back after the session ended isn't kept either; the client sees to that.
      if (sessionEnds.current === endsBefore) setSession(me);
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
    const endsBefore = sessionEnds.current;
    const me = await api.get<Me>('/auth/me');
    if (sessionEnds.current === endsBefore) setSession(me);
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
      endSession,
      login: async (body) => accept(await api.post<SessionResponse>('/auth/login', body)),
      signup: async (body) => accept(await api.post<SessionResponse>('/auth/signup', body)),
      logout: async () => {
        setLogoutError('');
        try {
          await api.post('/auth/logout');
        } catch (err) {
          // The server still has the session, so a reload would bring it back. This tab stays
          // logged in and says why, and other tabs are left alone.
          setLogoutError(`Couldn't log out. ${(err as Error).message}`);
          return;
        }
        endSession();
      },
    }),
    [session, loading, workspace, switchWorkspace, reload, restore, clearLocal, endSession, accept],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <Snackbar
        open={!!logoutError}
        autoHideDuration={6000}
        onClose={() => setLogoutError('')}
        message={logoutError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
