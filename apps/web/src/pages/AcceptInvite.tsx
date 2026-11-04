import type { InvitationPreview } from '@replypilot/shared';
import { Alert, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { session, loading, reload, logout } = useAuth();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<InvitationPreview>('/invitations/preview', { token }).then(setPreview).catch((err: Error) => setError(err.message));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/invitations/accept', { token });
      await reload();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const query = `?invite=${encodeURIComponent(token)}`;
  const rightPerson = session && preview && session.user.email === preview.email;

  return (
    <AuthLayout>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {(loading || (!preview && !error)) && <CircularProgress />}
          {preview && !loading && (
            <Stack spacing={2} alignItems="flex-start">
              <Typography variant="h5">Join {preview.workspaceName}</Typography>
              <Typography color="text.secondary">
                This invitation is for <strong>{preview.email}</strong>, as {preview.role === 'admin' ? 'an admin' : 'a team member'}.
              </Typography>
              {rightPerson ? (
                <Button variant="contained" size="large" disabled={busy} onClick={() => void accept()}>Accept invitation</Button>
              ) : session ? (
                <>
                  <Alert severity="warning" sx={{ alignSelf: 'stretch' }}>You&apos;re logged in as {session.user.email}. Log out to accept this invitation.</Alert>
                  <Button variant="outlined" onClick={() => void logout()}>Log out</Button>
                </>
              ) : preview.accountExists ? (
                <Button component={RouterLink} to={`/login${query}`} variant="contained" size="large">Log in to accept</Button>
              ) : (
                <Button component={RouterLink} to={`/signup${query}`} variant="contained" size="large">Create your account</Button>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
