import {
  Alert,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
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
          <Typography variant="h5" sx={{ mb: 1 }}>
            Reset your password
          </Typography>
          {sent ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              If that email has an account, a reset link is on its way. It works for 1 hour.
            </Alert>
          ) : (
            <form onSubmit={(e) => void submit(e)}>
              <Stack spacing={2} sx={{ mt: 2 }}>
                {error && <Alert severity="error">{error}</Alert>}
                <Typography color="text.secondary">
                  We&apos;ll email you a link to choose a new password.
                </Typography>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  fullWidth
                  autoComplete="email"
                />
                <Button type="submit" variant="contained" size="large" disabled={busy}>
                  Send reset link
                </Button>
              </Stack>
            </form>
          )}
          <Link component={RouterLink} to="/login" variant="body2" sx={{ display: 'block', mt: 3 }}>
            Back to log in
          </Link>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
