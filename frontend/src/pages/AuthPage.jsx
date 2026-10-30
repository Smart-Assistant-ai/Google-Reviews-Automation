import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material';
import Logo from '../components/Logo';
import Stars from '../components/Stars';
import { useAuth } from '../auth/AuthContext';

export default function AuthPage({ mode }) {
  const signup = mode === 'signup';
  const { login, signup: doSignup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', businessName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = signup ? await doSignup(form) : await login(form);
      navigate(res.workspace.onboardingStep === 'done' ? '/inbox' : '/onboarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, bgcolor: 'background.default' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', px: { xs: 2, sm: 6 }, py: 6 }}>
        <Box sx={{ maxWidth: 400, width: '100%', mx: 'auto' }}>
          <Logo />
          <Typography variant="h4" sx={{ mt: 5, mb: 1 }}>{signup ? 'Start your free trial' : 'Welcome back'}</Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {signup ? 'Every Google review answered, in your voice. No card needed.' : 'Log in to see what customers are saying.'}
          </Typography>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {signup && <TextField label="Your name" value={form.name} onChange={set('name')} required fullWidth />}
              {signup && <TextField label="Business name" value={form.businessName} onChange={set('businessName')} required fullWidth />}
              <TextField label="Email" type="email" value={form.email} onChange={set('email')} required fullWidth autoComplete="email" />
              <TextField
                label="Password" type="password" value={form.password} onChange={set('password')} required fullWidth
                helperText={signup ? 'At least 8 characters' : ' '} autoComplete={signup ? 'new-password' : 'current-password'}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy}>{signup ? 'Create account' : 'Log in'}</Button>
            </Stack>
          </form>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            {signup ? 'Already have an account? ' : 'New here? '}
            <Link component={RouterLink} to={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Create an account'}</Link>
          </Typography>
        </Box>
      </Box>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center', p: 6,
          background: (t) => (t.palette.mode === 'dark'
            ? 'linear-gradient(160deg, #0B3A30 0%, #0E1014 100%)'
            : 'linear-gradient(160deg, #DDF3EC 0%, #F6F6F3 100%)'),
        }}
      >
        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <Card sx={{ boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Stars value={2} />
              <Typography variant="body2" sx={{ mt: 1 }}>“Waited 40 minutes and the pizza arrived lukewarm.”</Typography>
              <Typography variant="caption" color="text.secondary">Priya S. · 2 hours ago</Typography>
            </CardContent>
          </Card>
          <Card sx={{ ml: 4, borderColor: 'primary.main', boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Typography variant="caption" color="primary" sx={{ fontWeight: 700 }}>AI DRAFT · WAITING FOR YOU</Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Hi Priya, we&apos;re truly sorry about the wait. That&apos;s not the experience we want for anyone…
              </Typography>
            </CardContent>
          </Card>
          <Typography variant="body2" color="text.secondary" sx={{ pt: 2 }}>
            AI drafts every reply in your brand voice. You approve, edit, or let trusted rules post for you.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
