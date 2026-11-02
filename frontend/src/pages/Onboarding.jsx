import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import Logo from '../components/Logo';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export default function Onboarding() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const callbackError = params.get('google_connected') === 'false' ? params.get('error') : '';
  const error = connectError || callbackError;

  useEffect(() => {
    if (params.get('google_connected')) refresh();
  }, [params, refresh]);

  useEffect(() => {
    if (session.workspace.onboardingStep === 'done') navigate('/inbox', { replace: true });
  }, [session.workspace.onboardingStep, navigate]);

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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Logo />
        <Card sx={{ mt: 5 }}>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={3} alignItems="flex-start">
              <Typography variant="h5">Connect your Google Business Profile</Typography>
              {error && <Alert severity="error" sx={{ alignSelf: 'stretch' }}>Connection failed: {error}</Alert>}
              <Typography color="text.secondary">
                Sign in with the Google account that owns or manages your hotel&apos;s Business Profile. We&apos;ll read
                your reviews and only post replies you approve.
              </Typography>
              <Button variant="contained" size="large" startIcon={<LinkRoundedIcon />} onClick={connect} disabled={busy}>
                Connect Google Business Profile
              </Button>
              <Typography variant="caption" color="text.secondary">
                You can disconnect anytime from Settings; we delete your review data when you do.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
