import type { Connection } from '@replypilot/shared';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { api } from '../api/client';
import { useRefreshWorkspaceData, useWorkspaceId, wsPath } from '../api/hooks';

// Shown when a Google sign-in worked but there is nothing to show yet, often because Google is
// refusing the app's requests, such as an API switched off or a rate limit. Inside a page that
// already has its own card, bare leaves out this one's card so it doesn't sit in a box in a box.
export default function GoogleEmptyState({
  connection,
  bare = false,
}: {
  connection: Connection;
  bare?: boolean;
}) {
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

  // An account with no Business Profile has nothing to lose, so it goes before trying another one.
  // Otherwise the only way out would be signing out of the app.
  const switchAccount = async () => {
    setBusy('switch');
    setError('');
    try {
      await api.delete(wsPath(workspaceId, `/google/connections/${connection.id}`));
      const { url } = await api.post<{ url: string }>(
        wsPath(workspaceId, '/google/connections/start'),
      );
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy('');
      await refresh();
    }
  };

  const body = (
    <Stack spacing={2.5} alignItems="flex-start">
      <Stack direction="row" spacing={1} alignItems="center">
        <CheckCircleRoundedIcon color="success" />
        <Typography variant="h6">Google account connected</Typography>
      </Stack>
      <Typography color="text.secondary">
        Signed in as <strong>{connection.email}</strong>. There are no reviews to show right now.
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        useFlexGap
        sx={{ flexWrap: 'wrap', '& .MuiButton-root': { whiteSpace: 'nowrap' } }}
      >
        <Button variant="contained" disabled={!!busy} onClick={run('sample', '/sample-data')}>
          {busy === 'sample' ? 'Loading…' : 'Use sample data'}
        </Button>
        <Button variant="outlined" disabled={!!busy} onClick={run('rescan', '/rescan')}>
          {busy === 'rescan' ? 'Checking…' : 'Check Google again'}
        </Button>
        {connection.locationCount === 0 && (
          <Button disabled={!!busy} onClick={() => void switchAccount()}>
            {busy === 'switch' ? 'Opening Google…' : 'Use another Google account'}
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Sample data is a fictional business. Replies you post to it never reach Google.
      </Typography>
    </Stack>
  );
  if (bare) return body;
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'center' }}>
      <Card sx={{ maxWidth: 560, width: '100%' }}>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>{body}</CardContent>
      </Card>
    </Box>
  );
}
