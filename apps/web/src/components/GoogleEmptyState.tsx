import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import api from '../api/client';

// Shown when real Google sign-in worked but there are no reviews to show yet.
export default function GoogleEmptyState({ status, onChanged }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = (key, request) => async () => {
    setBusy(key);
    setError('');
    try {
      await request();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'center' }}>
      <Card sx={{ maxWidth: 560, width: '100%' }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack spacing={2.5} alignItems="flex-start">
            <Stack direction="row" spacing={1} alignItems="center">
              <CheckCircleRoundedIcon color="success" />
              <Typography variant="h6">Google account connected</Typography>
            </Stack>
            <Typography color="text.secondary">
              Signed in as <strong>{status.email}</strong>. There are 0 reviews to show right now.
            </Typography>
            {status.apiError && <Alert severity="info" sx={{ alignSelf: 'stretch' }}>{status.apiError}</Alert>}
            {error && <Alert severity="error" sx={{ alignSelf: 'stretch' }}>{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" disabled={!!busy} onClick={run('sample', () => api.post('/google/sample-data'))}>
                {busy === 'sample' ? 'Loading…' : 'Use sample data'}
              </Button>
              <Button variant="outlined" disabled={!!busy} onClick={run('recheck', () => api.post('/google/recheck'))}>
                {busy === 'recheck' ? 'Checking…' : 'Check Google again'}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Sample data is a fictional business. Replies you post to it stay in this demo and never reach Google.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
