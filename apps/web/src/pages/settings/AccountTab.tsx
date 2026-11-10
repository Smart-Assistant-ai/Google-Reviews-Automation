import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export default function AccountTab() {
  const { session, reload, clearLocal } = useAuth();
  const [name, setName] = useState(session?.user.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => setName(session?.user.name ?? ''), [session?.user.name]);
  const hasPassword = session?.user.hasPassword;

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    }
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="subtitle2">Your details</Typography>
            <Typography variant="body2" color="text.secondary">
              {session?.user.email}
            </Typography>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              sx={{ maxWidth: 420 }}
            />
            <Button
              variant="contained"
              disabled={!name.trim()}
              onClick={() =>
                void run(async () => {
                  await api.patch('/auth/me', { name });
                  await reload();
                }, 'Saved.')
              }
            >
              Save
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="subtitle2">
              {hasPassword ? 'Change password' : 'Set a password'}
            </Typography>
            {hasPassword && (
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                fullWidth
                sx={{ maxWidth: 420 }}
                autoComplete="current-password"
              />
            )}
            <TextField
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              fullWidth
              sx={{ maxWidth: 420 }}
              helperText="At least 8 characters"
              autoComplete="new-password"
            />
            <Button
              variant="contained"
              disabled={!newPassword}
              onClick={() =>
                void run(async () => {
                  await api.post('/auth/change-password', {
                    currentPassword: currentPassword || undefined,
                    newPassword,
                  });
                  setCurrentPassword('');
                  setNewPassword('');
                  await reload();
                }, 'Password changed. Your other devices have been logged out.')
              }
            >
              Save password
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography variant="subtitle2">Sign-in</Typography>
            <Typography variant="body2" color="text.secondary">
              Google sign-in: {session?.user.hasGoogle ? 'linked' : 'not linked'}
            </Typography>
            <Button
              variant="outlined"
              onClick={() => void api.post('/auth/logout-all').then(clearLocal)}
            >
              Log out on all devices
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5} alignItems="flex-start">
            <Typography variant="subtitle2">Delete your account</Typography>
            <Typography variant="body2" color="text.secondary">
              Removes your details. If you own a workspace with other people in it, transfer it
              first.
            </Typography>
            <Button color="error" variant="outlined" onClick={() => setDeleting(true)}>
              Delete account
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={deleting} onClose={() => setDeleting(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This can&apos;t be undone.
          </Typography>
          {hasPassword && (
            <TextField
              label="Your password"
              type="password"
              fullWidth
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              autoComplete="current-password"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() =>
              void run(
                () => api.delete('/auth/me', { password: deletePassword || undefined }),
                '',
              ).then((ok) => {
                setDeleting(false);
                if (ok) clearLocal();
              })
            }
          >
            Delete account
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
