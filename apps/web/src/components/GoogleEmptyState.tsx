import type { Connection } from '@replypilot/shared';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { api } from '../api/client';
import { useRefreshWorkspaceData, useWorkspaceId, wsPath } from '../api/hooks';

// Shown when a Google sign-in worked but there is nothing to show yet, often because
// Google has not approved API access.
export default function GoogleEmptyState({ connection }: { connection: Connection }) {
  const workspaceId = useWorkspaceId();
  const refresh = useRefreshWorkspaceData();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = (key: string, path: string) => async () => {
    setBusy(key);
    setError('');
    try {
      await api.post(wsPath(workspaceId, `/google/connections/${connection.id}${path}`));
      await refresh();
    } catch (err) {
      setError((err as Error).message);
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
              Signed in as <strong>{connection.email}</strong>. There are no reviews to show right
              now.
            </Typography>
            {connection.apiError && (
              <Alert severity="info" sx={{ alignSelf: 'stretch' }}>
                {connection.apiError}
              </Alert>
            )}
            {error && (
              <Alert severity="error" sx={{ alignSelf: 'stretch' }}>
                {error}
              </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" disabled={!!busy} onClick={run('sample', '/sample-data')}>
                {busy === 'sample' ? 'Loading…' : 'Use sample data'}
              </Button>
              <Button variant="outlined" disabled={!!busy} onClick={run('rescan', '/rescan')}>
                {busy === 'rescan' ? 'Checking…' : 'Check Google again'}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Sample data is a fictional business. Replies you post to it never reach Google.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
