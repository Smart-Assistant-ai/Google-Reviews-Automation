import { useState } from 'react';
import {
  Alert, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import Stars from './Stars';
import api from '../api/client';

const DELAYS = [
  { value: 0, label: 'Immediately' },
  { value: 1, label: 'After 1 minute (demo)' },
  { value: 60, label: 'After 1 hour' },
  { value: 120, label: 'After 2 hours' },
  { value: 720, label: 'After 12 hours' },
  { value: 1440, label: 'After 24 hours' },
];

const TEXT_LABEL = { with_text: 'with written feedback', without_text: 'rating only, no text', any: 'any review' };

export default function RulesEditor({ rules, onChange }) {
  const [pending, setPending] = useState(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  const save = async (rule, body) => {
    setError('');
    try {
      const updated = await api.put(`/settings/rules/${rule.id}`, body);
      onChange(rules.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = (rule, enabled) => {
    if (enabled) {
      setConsent(false);
      setPending(rule);
    } else {
      save(rule, { enabled: false });
    }
  };

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      {rules.map((rule) => (
        <Card key={rule.id} sx={{ p: 2, borderColor: rule.enabled ? 'primary.main' : 'divider' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Stars value={rule.maxStars} size={16} />
                <Typography variant="subtitle2">
                  {rule.minStars === rule.maxStars ? `${rule.minStars}★` : `${rule.minStars}–${rule.maxStars}★`} · {TEXT_LABEL[rule.textCondition]}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Post the AI draft automatically unless you edit or cancel it first.
              </Typography>
            </Box>
            <TextField
              select size="small" label="When" value={rule.delayMinutes} sx={{ minWidth: 190 }}
              onChange={(e) => save(rule, { delayMinutes: Number(e.target.value) })}
            >
              {DELAYS.map((d) => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            <Switch checked={rule.enabled} onChange={(e) => toggle(rule, e.target.checked)} />
          </Stack>
        </Card>
      ))}
      <Card sx={{ p: 2, bgcolor: 'action.hover' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <LockRoundedIcon fontSize="small" color="disabled" />
          <Box>
            <Typography variant="subtitle2">1–3★ reviews always wait for you</Typography>
            <Typography variant="body2" color="text.secondary">Unhappy customers deserve a human look before anything is posted.</Typography>
          </Box>
        </Stack>
      </Card>

      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Turn on auto-replies?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            ReplyPilot will publicly post AI-written replies on your Google Business Profile for matching reviews,
            without asking you each time. It only applies to reviews that arrive after you turn it on, and you can turn it off anytime.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
            label={<Typography variant="body2">I allow ReplyPilot to post these replies on my behalf.</Typography>}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant="contained" disabled={!consent}
            onClick={async () => {
              await save(pending, { enabled: true, consent: true });
              setPending(null);
            }}
          >
            Turn on
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
