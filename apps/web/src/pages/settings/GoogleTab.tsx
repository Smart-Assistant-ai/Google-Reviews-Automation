import type { Connection, DisconnectPreview, Location } from '@replypilot/shared';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { api } from '../../api/client';
import { useGoogleStatus, useRefreshWorkspaceData, useWorkspaceId, wsPath } from '../../api/hooks';
import LocationPicker from '../../components/LocationPicker';
import { timeAgo } from '../../components/format';

export default function GoogleTab() {
  const workspaceId = useWorkspaceId();
  const refresh = useRefreshWorkspaceData();
  const { data: status, isLoading } = useGoogleStatus();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [disconnecting, setDisconnecting] = useState<{ connection: Connection; preview: DisconnectPreview } | null>(null);

  if (isLoading || !status) return <CircularProgress />;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const google = (path: string) => wsPath(workspaceId, `/google${path}`);

  const connect = () =>
    run('connect', async () => {
      const { url } = await api.post<{ url: string }>(google('/connections/start'));
      window.location.href = url;
    });

  const askDisconnect = (connection: Connection) =>
    run('preview', async () => {
      const preview = await api.get<DisconnectPreview>(google(`/connections/${connection.id}/disconnect-preview`));
      setDisconnecting({ connection, preview });
    });

  const available = status.locations.filter((l) => l.status === 'available');
  const managed = status.locations.filter((l) => l.status !== 'available');

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}

      <Box>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Google accounts</Typography>
          <Button size="small" startIcon={<AddRoundedIcon />} disabled={!!busy} onClick={() => void connect()}>Add a Google account</Button>
        </Stack>
        <Stack spacing={1.5}>
          {status.connections.length === 0 && <Typography color="text.secondary" variant="body2">No Google accounts connected yet.</Typography>}
          {status.connections.map((connection) => (
            <Card key={connection.id}>
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      <Typography variant="subtitle2" noWrap>{connection.email}</Typography>
                      <Chip size="small" color={connection.status === 'healthy' ? 'success' : 'warning'} label={connection.status === 'healthy' ? 'Healthy' : 'Needs reconnect'} />
                      {(connection.sample || connection.provider === 'mock') && <Chip size="small" variant="outlined" label="Sample data" />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{connection.locationCount} location{connection.locationCount === 1 ? '' : 's'}</Typography>
                  </Box>
                  {connection.status === 'needs_reconnect' && <Button variant="contained" disabled={!!busy} onClick={() => void connect()}>Reconnect</Button>}
                  <Button variant="outlined" disabled={!!busy} onClick={() => void run(`rescan-${connection.id}`, () => api.post(google(`/connections/${connection.id}/rescan`)))}>
                    {busy === `rescan-${connection.id}` ? 'Checking…' : 'Check Google'}
                  </Button>
                  {connection.sample && connection.provider === 'live' && (
                    <Button disabled={!!busy} onClick={() => void run('stop', () => api.delete(google(`/connections/${connection.id}/sample-data`)))}>Stop sample data</Button>
                  )}
                  <Button color="error" disabled={!!busy} onClick={() => void askDisconnect(connection)}>Disconnect</Button>
                </Stack>
                {connection.apiError && <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>{connection.apiError}</Alert>}
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>Locations you manage</Typography>
          <Button size="small" variant="outlined" disabled={!!busy} onClick={() => void run('sync', () => api.post(google('/sync')))}>
            {busy === 'sync' ? 'Syncing…' : 'Sync all now'}
          </Button>
        </Stack>
        <Stack spacing={1.5}>
          {managed.length === 0 && <Typography color="text.secondary" variant="body2">No locations yet.</Typography>}
          {managed.map((location) => (
            <LocationRow
              key={location.id} location={location} disabled={!!busy}
              onDeactivate={() => void run('deactivate', () => api.post(google(`/locations/${location.id}/deactivate`)))}
              onSwitch={(connectionId) => void run('switch', () => api.patch(google(`/locations/${location.id}/connection`), { connectionId }))}
            />
          ))}
        </Stack>
      </Box>

      {available.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>{available.length} more location{available.length === 1 ? '' : 's'} on Google</Typography>
          {picking ? (
            <LocationPicker
              locations={available} submitLabel="Add these locations" busy={busy === 'select'}
              onSubmit={(locationIds) => void run('select', () => api.post(google('/locations/select'), { locationIds })).then(() => setPicking(false))}
            />
          ) : (
            <Button variant="outlined" onClick={() => setPicking(true)}>Choose more locations</Button>
          )}
        </Box>
      )}

      <Dialog open={!!disconnecting} onClose={() => setDisconnecting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Disconnect {disconnecting?.connection.email}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>We&apos;ll revoke access. Replies already on Google stay there.</Typography>
          {disconnecting && disconnecting.preview.removes.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              These locations and their stored reviews and replies will be deleted: {disconnecting.preview.removes.map((l) => l.title).join(', ')}.
            </Alert>
          )}
          {disconnecting && disconnecting.preview.moves.length > 0 && (
            <Alert severity="info">
              These move to another connected account and keep their data: {disconnecting.preview.moves.map((l) => `${l.title} (${l.toEmail})`).join(', ')}.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisconnecting(null)}>Cancel</Button>
          <Button
            color="error" variant="contained" disabled={!!busy}
            onClick={() => void run('disconnect', () => api.delete(google(`/connections/${disconnecting!.connection.id}`))).then(() => setDisconnecting(null))}
          >
            Disconnect
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function LocationRow({ location, disabled, onDeactivate, onSwitch }: { location: Location; disabled: boolean; onDeactivate: () => void; onSwitch: (connectionId: string) => void }) {
  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2" noWrap>{location.title}</Typography>
              {location.status === 'access_lost' && <Chip size="small" color="warning" label="Access lost" />}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div">
              {location.connectionEmail} · last synced {location.lastSyncedAt ? timeAgo(location.lastSyncedAt) : 'never'}
            </Typography>
            {location.lastSyncError && <Typography variant="caption" color="error" component="div">{location.lastSyncError}</Typography>}
          </Box>
          {location.alternativeConnections.length > 0 && (
            <TextField
              select size="small" label="Connected through" value={location.connectionId} disabled={disabled} sx={{ minWidth: 200 }}
              onChange={(e) => onSwitch(e.target.value)}
            >
              <MenuItem value={location.connectionId}>{location.connectionEmail}</MenuItem>
              {location.alternativeConnections.map((c) => <MenuItem key={c.id} value={c.id}>{c.email}</MenuItem>)}
            </TextField>
          )}
          <Button disabled={disabled} onClick={onDeactivate}>Stop managing</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
