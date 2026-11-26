import { WORKSPACE_NAME_MAX } from '@replypilot/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useBilling, useWorkspaceId, wsPath } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';

export default function WorkspaceTab() {
  const { workspace, reload } = useAuth();
  const workspaceId = useWorkspaceId();
  const { data: billing } = useBilling();
  // A paid plan ends with the workspace, so the owner knows the card stops being charged. Unless
  // a live plan is shown, the warning still covers one there may be: our copy can miss a plan paid
  // moments ago, and the plan may not have loaded. Only a server with billing off has none.
  const paying = ['active', 'trialing', 'past_due'].includes(billing?.plan?.status ?? '');
  const plan = paying
    ? 'Your plan'
    : billing?.state === 'free'
      ? null
      : 'Any plan this workspace has';
  const navigate = useNavigate();
  const [name, setName] = useState(workspace?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => setName(workspace?.name ?? ''), [workspace?.name]);

  const rename = async () => {
    setError('');
    try {
      await api.patch(wsPath(workspaceId, ''), { name });
      await reload();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    setError('');
    try {
      await api.delete(wsPath(workspaceId, ''));
      await reload();
      setDeleting(false);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="subtitle2">Workspace name</Typography>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              sx={{ maxWidth: 420 }}
              inputProps={{ 'aria-label': 'Workspace name', maxLength: WORKSPACE_NAME_MAX }}
            />
            <Button
              variant="contained"
              disabled={!name.trim() || name === workspace?.name}
              onClick={() => void rename()}
            >
              Save
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {workspace?.role === 'owner' && (
        <Card>
          <CardContent>
            <Stack spacing={1.5} alignItems="flex-start">
              <Typography variant="subtitle2">Delete this workspace</Typography>
              <Typography variant="body2" color="text.secondary">
                Disconnects Google and deletes all stored reviews and replies, for everyone. Replies
                already on Google stay there.
                {plan && ` ${plan} is cancelled too, so the card isn't charged again.`}
              </Typography>
              <Button color="error" variant="outlined" onClick={() => setDeleting(true)}>
                Delete workspace
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Dialog open={deleting} onClose={() => setDeleting(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {workspace?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This can&apos;t be undone.
            {plan && ` ${plan} is cancelled at once, with no refund for time already paid.`} Type
            the workspace name to confirm.
          </Typography>
          <TextField
            fullWidth
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            inputProps={{ 'aria-label': 'Confirm workspace name' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={confirmName !== workspace?.name}
            onClick={() => void remove()}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Box>
        <Snackbar
          open={saved}
          autoHideDuration={2500}
          onClose={() => setSaved(false)}
          message="Saved"
        />
      </Box>
    </Stack>
  );
}
