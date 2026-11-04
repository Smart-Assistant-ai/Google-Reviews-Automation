import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const SCENARIOS = [
  { value: 'single', label: 'One location' },
  { value: 'multi', label: 'Three locations' },
  { value: 'groups', label: 'Two account groups, four locations' },
  { value: 'many', label: '120 locations' },
  { value: 'none', label: 'No locations' },
];

const encode = (value: object) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// Stand-in for Google's consent screen when running with the mock provider, so every account shape
// can be tried. Intentionally unbranded, because it must never look like a real Google page.
export default function MockGoogle() {
  const [params] = useSearchParams();
  const state = params.get('state') ?? '';
  const signIn = params.get('flow') === 'signin';
  const [email, setEmail] = useState(signIn ? 'someone@example.test' : 'owner@sample.test');
  const [scenario, setScenario] = useState('multi');

  const base = signIn ? '/api/v1/auth/google/callback' : '/api/v1/google/callback';
  const go = (allow: boolean) => {
    const code = signIn
      ? encode({ sub: `mock-${email}`, email, name: email.split('@')[0], emailVerified: true })
      : encode({ scenario, email });
    const query = allow ? `code=${code}` : 'error=access_denied';
    window.location.href = `${base}?${query}&state=${encodeURIComponent(state)}`;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ maxWidth: 460, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <ScienceRoundedIcon color="warning" />
            <Typography variant="overline" color="warning.main" sx={{ fontWeight: 700 }}>
              Test mode · simulated sign-in
            </Typography>
          </Stack>
          <Typography variant="h5" sx={{ mb: 1 }}>
            {signIn ? 'Sign in to ReplyPilot' : 'ReplyPilot wants to manage your Business Profile'}
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
            In production this step is Google&apos;s own screen.
          </Typography>
          <Stack spacing={2} sx={{ mb: 3 }}>
            <TextField
              label="Google account email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />
            {!signIn && (
              <TextField
                select
                label="What this account manages"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                fullWidth
              >
                {SCENARIOS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
          {!signIn && (
            <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
              Scope requested: <code>business.manage</code>
            </Alert>
          )}
          <Divider sx={{ mb: 3 }} />
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button onClick={() => go(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => go(true)}>
              Allow
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
