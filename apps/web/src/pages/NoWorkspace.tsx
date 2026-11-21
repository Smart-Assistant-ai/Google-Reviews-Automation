import { WORKSPACE_NAME_MAX } from '@replypilot/shared';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthConfig } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/AuthLayout';

// Someone can end up with no workspace after leaving one or being removed.
export default function NoWorkspace() {
  const { workspace, reload, switchWorkspace, logout } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  // Joining someone else's workspace takes an emailed invitation.
  const emails = useAuthConfig().data?.emails === true;

  if (workspace) return <Navigate to="/" replace />;

  const create = async () => {
    try {
      const created = await api.post<{ id: string }>('/workspaces', { name });
      switchWorkspace(created.id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Stack spacing={2}>
            <Typography variant="h5">You&apos;re not in a workspace</Typography>
            <Typography color="text.secondary">
              Create one for your business{emails && ', or ask a teammate to invite you'}.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Business name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputProps={{ maxLength: WORKSPACE_NAME_MAX }}
              fullWidth
            />
            <Button
              variant="contained"
              size="large"
              disabled={!name.trim()}
              onClick={() => void create()}
            >
              Create workspace
            </Button>
            <Button onClick={() => void logout()}>Log out</Button>
          </Stack>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
