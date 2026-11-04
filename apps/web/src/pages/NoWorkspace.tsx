import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/AuthLayout';

// Someone can end up with no workspace after leaving one or being removed.
export default function NoWorkspace() {
  const { workspace, reload, switchWorkspace, logout } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

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
              Create one for your business, or ask a teammate to invite you.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Business name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
