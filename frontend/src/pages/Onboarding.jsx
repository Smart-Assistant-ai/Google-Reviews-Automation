import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Container, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import Logo from '../components/Logo';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export default function Onboarding() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const callbackError = params.get('google_connected') === 'false' ? params.get('error') : '';
  const error = connectError || callbackError;
  const conflict = params.get('google_connected') === 'false' && params.get('conflict') === 'true';
  const [connected, setConnected] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const isDone = session.workspace.onboardingStep === 'done';

  useEffect(() => {
    if (params.get('google_connected')) refresh();
  }, [params, refresh]);

  // A finished workspace stays here during a conflict, or the recovery options would never be seen.
  useEffect(() => {
    if (isDone && !conflict) navigate('/inbox', { replace: true });
  }, [isDone, conflict, navigate]);

  useEffect(() => {
    if (!conflict) return;
    api.get('/google/status').then((status) => setConnected(status.connected ? status : null)).catch(() => {});
  }, [conflict]);

  const connect = async () => {
    setBusy(true);
    setConnectError('');
    try {
      const { url } = await api.get('/google/connect');
      window.location.href = url;
    } catch (err) {
      setConnectError(err.message);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setConnectError('');
    try {
      await api.delete('/google/connection');
      setConfirm(false);
      setConnected(null);
      // Refresh first: clearing the conflict while the step is still 'done' would redirect to the inbox.
      await refresh();
      setParams({}, { replace: true });
    } catch (err) {
      setConfirm(false);
      setConnectError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Logo />
        <Card sx={{ mt: 5 }}>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={3} alignItems="flex-start">
              <Typography variant="h5">Connect your Google Business Profile</Typography>
              {error && <Alert severity="error" sx={{ alignSelf: 'stretch' }}>Connection failed: {error}</Alert>}
              {conflict && connected && (
                <Typography>
                  Currently connected: <strong>{connected.email}</strong>{connected.location ? ` (${connected.location.title})` : ''}
                </Typography>
              )}
              <Typography color="text.secondary">
                Sign in with the Google account that owns or manages your hotel&apos;s Business Profile. We&apos;ll read
                your reviews and only post replies you approve.
              </Typography>
              <Button variant="contained" size="large" startIcon={<LinkRoundedIcon />} onClick={connect} disabled={busy}>
                Connect Google Business Profile
              </Button>
              {conflict && connected && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  {isDone && <Button variant="outlined" onClick={() => navigate('/inbox', { replace: true })}>Keep this account</Button>}
                  <Button color="error" disabled={busy} onClick={() => setConfirm(true)}>Disconnect this account</Button>
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary">
                You can disconnect anytime from Settings; we delete your review data when you do.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs">
        <DialogTitle>Disconnect {connected?.email}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            We&apos;ll revoke access and delete the reviews and replies we stored for this profile. Replies already on Google stay there.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={disconnect}>Disconnect</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
