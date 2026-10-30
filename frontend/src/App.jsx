import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './auth/AuthContext';
import AppShell from './layout/AppShell';
import AuthPage from './pages/AuthPage';
import Onboarding from './pages/Onboarding';
import MockGoogleConsent from './pages/MockGoogleConsent';
import Inbox from './pages/Inbox';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

function FullPageLoader() {
  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

function RequireAuth({ children, allowOnboarding = false }) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (!allowOnboarding && session.workspace.onboardingStep !== 'done') return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
      <Route path="/signup" element={session ? <Navigate to="/" replace /> : <AuthPage mode="signup" />} />
      <Route path="/mock-google-consent" element={<MockGoogleConsent />} />
      <Route path="/onboarding" element={<RequireAuth allowOnboarding><Onboarding /></RequireAuth>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
