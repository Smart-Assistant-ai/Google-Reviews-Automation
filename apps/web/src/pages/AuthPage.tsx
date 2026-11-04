import type { InvitationPreview } from '@replypilot/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthConfig } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';
import Stars from '../components/Stars';

const GOOGLE_ERRORS: Record<string, string> = {
  google_state: 'That sign-in link expired. Please try again.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_unverified: 'Your Google account email is not verified, so we cannot use it to sign in.',
  verify_first:
    'An account with this email already exists but has not been confirmed. Log in with your password, or reset it, and then you can use Google.',
  signup_not_allowed: 'Signup is by invitation only for now. Please contact us to get access.',
  account_unavailable: 'This account is not available.',
};

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  const { login, signup: doSignup } = useAuth();
  const { data: config } = useAuthConfig();
  const [params] = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const [form, setForm] = useState({
    name: '',
    businessName: '',
    email: params.get('email') ?? '',
    password: '',
  });
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState(GOOGLE_ERRORS[params.get('error') ?? ''] ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!invite) return;
    api
      .get<InvitationPreview>('/invitations/preview', { token: invite })
      .then((preview) => {
        setInvitation(preview);
        setForm((current) => ({ ...current, email: preview.email }));
      })
      .catch((err: Error) => setError(err.message));
  }, [invite]);

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (signup) {
        await doSignup({
          email: form.email,
          password: form.password,
          name: form.name,
          ...(invite ? { inviteToken: invite } : { businessName: form.businessName }),
        });
      } else {
        await login({ email: form.email, password: form.password });
      }
      // The session is set, so the route guards take over from here.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const googleHref = `/api/v1/auth/google/start${invite ? `?invite=${encodeURIComponent(invite)}` : ''}`;
  const query = invite ? `?invite=${encodeURIComponent(invite)}` : '';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { xs: 2, sm: 6 },
          py: 6,
        }}
      >
        <Box sx={{ maxWidth: 400, width: '100%', mx: 'auto' }}>
          <Logo />
          <Typography variant="h4" sx={{ mt: 5, mb: 1 }}>
            {signup ? 'Create your account' : 'Welcome back'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {invitation
              ? `You've been invited to ${invitation.workspaceName}.`
              : signup
                ? 'Every Google review of your business answered, in your voice.'
                : 'Log in to see what customers are saying.'}
          </Typography>
          {signup && !invite && config?.signupMode === 'allowlist' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Signup is by invitation only for now. Use the email we added for you.
            </Alert>
          )}
          <form onSubmit={(e) => void submit(e)}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {signup && (
                <TextField
                  label="Your name"
                  value={form.name}
                  onChange={set('name')}
                  required
                  fullWidth
                  autoComplete="name"
                />
              )}
              {signup && !invite && (
                <TextField
                  label="Business name"
                  value={form.businessName}
                  onChange={set('businessName')}
                  required
                  fullWidth
                  autoComplete="organization"
                />
              )}
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                fullWidth
                autoComplete="email"
                disabled={!!invitation}
              />
              <TextField
                label="Password"
                type="password"
                value={form.password}
                onChange={set('password')}
                required
                fullWidth
                helperText={signup ? 'At least 8 characters' : ' '}
                autoComplete={signup ? 'new-password' : 'current-password'}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy}>
                {signup ? 'Create account' : 'Log in'}
              </Button>
            </Stack>
          </form>
          {config?.googleSignIn && (
            <>
              <Divider sx={{ my: 3 }}>or</Divider>
              <Button variant="outlined" size="large" fullWidth href={googleHref}>
                Continue with Google
              </Button>
            </>
          )}
          <Stack spacing={1} sx={{ mt: 3 }}>
            {!signup && (
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                Forgot your password?
              </Link>
            )}
            <Typography variant="body2" color="text.secondary">
              {signup ? 'Already have an account? ' : 'New here? '}
              <Link component={RouterLink} to={`${signup ? '/login' : '/signup'}${query}`}>
                {signup ? 'Log in' : 'Create an account'}
              </Link>
            </Typography>
          </Stack>
        </Box>
      </Box>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          justifyContent: 'center',
          p: 6,
          background: (t) =>
            t.palette.mode === 'dark'
              ? 'linear-gradient(160deg, #0B3A30 0%, #0E1014 100%)'
              : 'linear-gradient(160deg, #DDF3EC 0%, #F6F6F3 100%)',
        }}
      >
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <Card sx={{ boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Stars value={2} />
              <Typography variant="body2" sx={{ mt: 1 }}>
                “We waited 40 minutes and nobody told us why.”
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Megan S. · 2 hours ago
              </Typography>
            </CardContent>
          </Card>
          <Card
            sx={{ ml: 4, borderColor: 'primary.main', boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
          >
            <CardContent>
              <Typography variant="caption" color="primary" sx={{ fontWeight: 700 }}>
                AI DRAFT · WAITING FOR YOU
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Hi Megan, we&apos;re truly sorry about the wait. That&apos;s not the experience we
                want for anyone…
              </Typography>
            </CardContent>
          </Card>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 2 }}>
            AI drafts every reply in your business&apos;s voice. You review, edit and post.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
