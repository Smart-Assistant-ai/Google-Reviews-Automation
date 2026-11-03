import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import ScienceRoundedIcon from '@mui/icons-material/ScienceRounded';
import { API_URL } from '../api/client';

// Stand-in for Google's OAuth consent screen while GBP_PROVIDER=mock.
// Intentionally unbranded: it must never look like a real Google page.
export default function MockGoogleConsent() {
  const [params] = useSearchParams();
  const state = params.get('state');
  const go = (allow) => {
    const qs = allow ? `code=mock-code&state=${state}` : `error=access_denied&state=${state}`;
    window.location.href = `${API_URL}/google/callback?${qs}`;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
      <Card sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <ScienceRoundedIcon color="warning" />
            <Typography variant="overline" color="warning.main" sx={{ fontWeight: 700 }}>Demo mode · simulated sign-in</Typography>
          </Stack>
          <Typography variant="h5" sx={{ mb: 1 }}>ReplyPilot wants to manage your Business Profile</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>
            In production this step is Google&apos;s own consent screen. ReplyPilot will be able to:
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography variant="body2">• Read reviews for your Business Profile</Typography>
            <Typography variant="body2">• Post and edit replies on your behalf (only as you allow)</Typography>
            <Typography variant="body2">• See your account email address</Typography>
          </Stack>
          <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
            Scope requested: <code>business.manage</code>
          </Alert>
          <Divider sx={{ mb: 3 }} />
          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button onClick={() => go(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => go(true)}>Allow</Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
