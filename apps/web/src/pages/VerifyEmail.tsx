import { Alert, Button, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { session, reload } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');
  // The link only works once, and React runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post('/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((err: Error) => {
        setError(err.message);
        setState('failed');
      });
  }, [token]);

  useEffect(() => {
    if (state === 'done' && session) void reload();
    // Only when the outcome changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <AuthLayout>
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 5 } }}>
          <Typography variant="h5" sx={{ mb: 2 }}>Confirm your email</Typography>
          {state === 'working' && <CircularProgress />}
          {state === 'done' && <Alert severity="success">Your email is confirmed.</Alert>}
          {state === 'failed' && <Alert severity="error">{error}</Alert>}
          {state !== 'working' && (
            <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 3 }}>Continue</Button>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
