import { hasAtLeast, type Voice, type VoiceResponse } from '@replypilot/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, CircularProgress, MenuItem, Snackbar, Stack, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useVoice, useWorkspaceId, wsPath } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import VoiceForm from '../../components/VoiceForm';
import { managedLocations, useShell } from '../../layout/ShellContext';

export default function VoiceTab() {
  const { workspace } = useAuth();
  const isAdmin = workspace ? hasAtLeast(workspace.role, 'admin') : false;
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();
  const { status } = useShell();
  const locations = managedLocations(status);

  // Members can't change the workspace default, so they start on their first location.
  const [scope, setScope] = useState<string>(isAdmin ? 'default' : (locations[0]?.id ?? 'default'));
  const locationId = scope === 'default' ? undefined : scope;
  const { data } = useVoice(locationId);
  const [voice, setVoice] = useState<Voice | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) setVoice(data.voice);
  }, [data]);

  if (!data || !voice) return <CircularProgress />;

  const canEdit = isAdmin || !!locationId;
  const accept = (res: VoiceResponse, message: string) => {
    queryClient.setQueryData(['voice', workspaceId, locationId ?? 'default'], res);
    setSaved(message);
    setError('');
  };
  const save = async () => {
    try {
      const path = locationId ? `/voice/locations/${locationId}` : '/voice';
      accept(await api.put<VoiceResponse>(wsPath(workspaceId, path), voice), 'Voice saved');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const reset = async () => {
    try {
      accept(await api.delete<VoiceResponse>(wsPath(workspaceId, `/voice/locations/${locationId}`)), 'Using the workspace voice');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        Drafts are written by {data.drafter === 'openai' ? 'AI' : 'the built-in offline drafter, because no AI key is set'}.
        Changes apply to new drafts. Use “Rewrite” in the inbox to refresh existing ones.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {locations.length > 0 && (
        <TextField select label="Voice for" value={scope} onChange={(e) => setScope(e.target.value)} sx={{ maxWidth: 360 }}>
          {isAdmin && <MenuItem value="default">All locations (default)</MenuItem>}
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.title}</MenuItem>)}
        </TextField>
      )}
      {locationId && !data.isOverride && <Alert severity="info" variant="outlined">This location uses the workspace voice. Saving gives it its own.</Alert>}
      <VoiceForm value={voice} onChange={setVoice} disabled={!canEdit} />
      {canEdit && (
        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={() => void save()}>Save voice</Button>
          {locationId && data.isOverride && <Button onClick={() => void reset()}>Use the workspace voice</Button>}
        </Stack>
      )}
      <Box>
        <Snackbar open={!!saved} autoHideDuration={2500} onClose={() => setSaved('')} message={saved} />
      </Box>
    </Stack>
  );
}
