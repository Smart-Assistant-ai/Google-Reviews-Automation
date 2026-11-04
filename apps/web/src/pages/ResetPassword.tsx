import { Alert, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { clearLocal } = useAuth();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      // Every session just ended, including one in this browser.
      clearLocal();
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Choose a new password</Typography>
          {done ? (
            <>
              <Alert severity="success">Your password is changed, and you&apos;ve been logged out on every device.</Alert>
              <Link component={RouterLink} to="/login" sx={{ display: 'block', mt: 3 }}>Log in</Link>
            </>
          ) : (
            <form onSubmit={(e) => void submit(e)}>
              <Stack spacing={2}>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth helperText="At least 8 characters" autoComplete="new-password" />
                <Button type="submit" variant="contained" size="large" disabled={busy}>Change password</Button>
              </Stack>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
