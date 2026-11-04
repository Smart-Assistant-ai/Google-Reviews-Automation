import { hasAtLeast } from '@replypilot/shared';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useGoogleStatus, useRefreshWorkspaceData, useWorkspaceId, wsPath } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import GoogleEmptyState from '../components/GoogleEmptyState';
import LocationPicker from '../components/LocationPicker';
import Logo from '../components/Logo';

const CONNECT_ERRORS: Record<string, string> = {
  google_state: 'That connection link expired or was opened in a different browser. Please try again.',
  google_denied: 'Google access was not granted, so nothing was connected.',
  google_failed: 'We could not finish connecting to Google. Please try again.',
};

export default function Onboarding() {
  const { session, workspace, switchWorkspace, logout } = useAuth();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refresh = useRefreshWorkspaceData();
  const { data: status, isLoading } = useGoogleStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(CONNECT_ERRORS[params.get('error') ?? ''] ?? '');

  // Google sends the person back to whichever workspace they started from.
  const fromWorkspace = params.get('workspace');
  useEffect(() => {
    if (fromWorkspace) switchWorkspace(fromWorkspace);
  }, [fromWorkspace, switchWorkspace]);

  if (!workspace) return <Navigate to="/no-workspace" replace />;
  if (!hasAtLeast(workspace.role, 'admin')) return <Navigate to="/inbox" replace />;

  const verified = session?.user.emailVerified;
  const managed = status?.locations.filter((l) => l.status !== 'available') ?? [];
  const available = status?.locations.filter((l) => l.status === 'available') ?? [];
  if (managed.length > 0) return <Navigate to="/inbox" replace />;

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const { url } = await api.post<{ url: string }>(wsPath(workspaceId, '/google/connections/start'));
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const choose = async (locationIds: string[]) => {
    setBusy(true);
    setError('');
    try {
      await api.post(wsPath(workspaceId, '/google/locations/select'), { locationIds });
      await refresh();
      navigate('/inbox');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const blocked = status?.connections.find((c) => c.apiError);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Stack direction="row" alignItems="center">
          <Box sx={{ flex: 1 }}><Logo /></Box>
          <Button size="small" onClick={() => void logout()}>Log out</Button>
        </Stack>
        <Card sx={{ mt: 5 }}>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            {isLoading ? (
              <CircularProgress />
            ) : available.length > 0 ? (
              <Stack spacing={3} alignItems="flex-start">
                <Typography variant="h5">Choose your locations</Typography>
                <Typography color="text.secondary">We&apos;ll load reviews only for the locations you pick. You can change this later in Settings.</Typography>
                <LocationPicker locations={available} submitLabel="Manage these locations" busy={busy} error={error} onSubmit={(ids) => void choose(ids)} />
              </Stack>
            ) : blocked ? (
              <GoogleEmptyState connection={blocked} />
            ) : (
              <Stack spacing={3} alignItems="flex-start">
                <Typography variant="h5">Connect your Google Business Profile</Typography>
                {error && <Alert severity="error" sx={{ alignSelf: 'stretch' }}>{error}</Alert>}
                {!verified && (
                  <Alert severity="warning" sx={{ alignSelf: 'stretch' }}>
                    Confirm your email first. We sent a link to {session?.user.email}.
                    <Button size="small" sx={{ ml: 1 }} onClick={() => void api.post('/auth/resend-verification')}>Send again</Button>
                  </Alert>
                )}
                <Typography color="text.secondary">
                  Sign in with the Google account that owns or manages your Business Profile. We&apos;ll read your reviews and only post replies you approve.
                </Typography>
                <Button variant="contained" size="large" startIcon={<LinkRoundedIcon />} onClick={() => void connect()} disabled={busy || !verified}>
                  Connect Google Business Profile
                </Button>
                <Typography variant="caption" color="text.secondary">You can disconnect anytime from Settings. We delete its review data when you do.</Typography>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
