import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import FullPageLoader from './components/FullPageLoader';
import AppShell from './layout/AppShell';
import AcceptInvite from './pages/AcceptInvite';
import AuthCallback from './pages/AuthCallback';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import DevOutbox from './pages/DevOutbox';
import ForgotPassword from './pages/ForgotPassword';
import Inbox from './pages/Inbox';
import Landing from './pages/Landing';
import MockGoogle from './pages/MockGoogle';
import NoWorkspace from './pages/NoWorkspace';
import Onboarding from './pages/Onboarding';
import Privacy from './pages/Privacy';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import VerifyEmail from './pages/VerifyEmail';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({
  children,
  backToInvite = false,
}: {
  children: ReactNode;
  backToInvite?: boolean;
}) {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <FullPageLoader />;
  if (!session) return children;
  // Logging in from an invitation link goes back to that invitation to accept it. Signing up
  // from one has already joined, so going back would only show the used invitation as an error.
  const invite = backToInvite ? params.get('invite') : null;
  return <Navigate to={invite ? `/invite?token=${encodeURIComponent(invite)}` : '/'} replace />;
}

// The home page explains ReplyPilot to visitors, and Google's verification reads it too. Someone
// already logged in goes straight to their inbox. It shows while the session loads as well,
// since the page built ahead of time is already on screen by then, rather than swapping it for a
// spinner.
function Home() {
  const { session } = useAuth();
  if (session) return <Navigate to="/inbox" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly backToInvite>
            <AuthPage mode="login" />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <AuthPage mode="signup" />
          </PublicOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnly>
            <ForgotPassword />
          </PublicOnly>
        }
      />
      <Route path="/" element={<Home />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/invite" element={<AcceptInvite />} />
      <Route path="/dev/outbox" element={<DevOutbox />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/mock-google" element={<MockGoogle />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/no-workspace"
        element={
          <RequireAuth>
            <NoWorkspace />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
