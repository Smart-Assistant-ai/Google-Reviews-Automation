import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Container, Stack, Step, StepLabel,
  Stepper, Typography,
} from '@mui/material';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import Logo from '../components/Logo';
import VoiceForm from '../components/VoiceForm';
import RulesEditor from '../components/RulesEditor';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

const STEPS = [
  { key: 'connect', label: 'Connect Google' },
  { key: 'location', label: 'Pick location' },
  { key: 'voice', label: 'Your reply voice' },
  { key: 'rules', label: 'Auto-replies' },
];

function ConnectStep({ error }) {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    const { url } = await api.get('/google/connect');
    window.location.href = url;
  };
  return (
    <Stack spacing={3} alignItems="flex-start">
      {error && <Alert severity="error" sx={{ alignSelf: 'stretch' }}>Connection failed: {error}</Alert>}
      <Typography color="text.secondary">
        Sign in with the Google account that owns or manages your Business Profile. We&apos;ll read your reviews
        and only post replies you approve — or that match rules you turn on.
      </Typography>
      <Button variant="contained" size="large" startIcon={<LinkRoundedIcon />} onClick={connect} disabled={busy}>
        Connect Google Business Profile
      </Button>
      <Typography variant="caption" color="text.secondary">
        You can disconnect anytime from Settings; we delete your review data when you do.
      </Typography>
    </Stack>
  );
}

function LocationStep({ onDone }) {
  const [locations, setLocations] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/google/locations').then(setLocations).catch((e) => setError(e.message));
  }, []);
  const pick = async (id) => {
    setBusy(id);
    try {
      await api.post('/google/locations/select', { locationId: id });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  };
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!locations) return <CircularProgress />;
  return (
    <Stack spacing={1.5}>
      <Typography color="text.secondary" sx={{ mb: 1 }}>Which location should ReplyPilot manage?</Typography>
      {locations.map((l) => (
        <Card key={l.id}>
          <CardActionArea onClick={() => pick(l.id)} disabled={!!busy}>
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                <StorefrontRoundedIcon color="primary" />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle2">{l.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{l.address}</Typography>
                </Box>
                {busy === l.id && <><CircularProgress size={20} /><Typography variant="caption">Importing reviews…</Typography></>}
              </Stack>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}

function VoiceStep({ onDone }) {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    api.get('/settings/voice').then(setVoice);
  }, []);
  if (!voice) return <CircularProgress />;
  return (
    <Stack spacing={3}>
      <Typography color="text.secondary">Tell the AI how you sound. You can fine-tune this anytime.</Typography>
      <VoiceForm value={voice} onChange={setVoice} />
      <Box>
        <Button variant="contained" size="large" onClick={async () => { await api.put('/settings/voice', voice); onDone(); }}>
          Save and continue
        </Button>
      </Box>
    </Stack>
  );
}

function RulesStep({ onDone }) {
  const [rules, setRules] = useState(null);
  useEffect(() => {
    api.get('/settings/rules').then(setRules);
  }, []);
  if (!rules) return <CircularProgress />;
  return (
    <Stack spacing={3}>
      <Alert icon={<CheckCircleRoundedIcon />} severity="success" variant="outlined">
        By default, every reply waits for your approval. Auto-replies are optional.
      </Alert>
      <RulesEditor rules={rules} onChange={setRules} />
      <Box>
        <Button variant="contained" size="large" onClick={onDone}>Go to my inbox</Button>
      </Box>
    </Stack>
  );
}

export default function Onboarding() {
  const { session, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const step = session.workspace.onboardingStep;

  useEffect(() => {
    if (params.get('google_connected')) refresh();
  }, [params, refresh]);

  useEffect(() => {
    if (step === 'done') navigate('/inbox', { replace: true });
  }, [step, navigate]);

  const active = Math.max(0, STEPS.findIndex((s) => s.key === step));
  const finish = async () => {
    await api.post('/settings/onboarding/complete');
    await refresh();
    navigate('/inbox');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="md">
        <Logo />
        <Stepper activeStep={active} alternativeLabel sx={{ my: 5 }}>
          {STEPS.map((s) => <Step key={s.key}><StepLabel>{s.label}</StepLabel></Step>)}
        </Stepper>
        <Card>
          <CardContent sx={{ p: { xs: 3, md: 5 } }}>
            <Typography variant="h5" sx={{ mb: 2 }}>{STEPS[active].label}</Typography>
            {step === 'connect' && <ConnectStep error={params.get('google_connected') === 'false' ? params.get('error') : ''} />}
            {step === 'location' && <LocationStep onDone={refresh} />}
            {step === 'voice' && <VoiceStep onDone={refresh} />}
            {step === 'rules' && <RulesStep onDone={finish} />}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
