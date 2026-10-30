import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  List, ListItem, ListItemText, Snackbar, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import VoiceForm from '../components/VoiceForm';
import RulesEditor from '../components/RulesEditor';
import { timeAgo } from '../components/format';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

const ACTION_LABELS = {
  'google.connected': 'Connected Google Business Profile',
  'google.disconnected': 'Disconnected Google Business Profile',
  'reply.posted': 'Posted a reply',
  'reply.auto_posted': 'Auto-posted a reply',
  'reply.edited': 'Edited a draft',
  'reply.regenerated': 'Asked AI for a new draft',
  'reply.scheduled': 'Scheduled an auto-reply',
  'reply.schedule_cancelled': 'Cancelled an auto-reply',
  'reply.deleted': 'Deleted a reply',
  'rule.updated': 'Updated an auto-reply rule',
};

function VoiceTab() {
  const [voice, setVoice] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.get('/settings/voice').then(setVoice);
  }, []);
  if (!voice) return <CircularProgress />;
  return (
    <Stack spacing={3}>
      <Alert severity="info" variant="outlined">
        Drafts are written by {voice.drafter === 'openai' ? 'OpenAI' : 'the built-in demo drafter (add OPENAI_API_KEY for full AI drafts)'}.
        Changes apply to new drafts; use “Rewrite” in the inbox to refresh existing ones.
      </Alert>
      <VoiceForm value={voice} onChange={setVoice} />
      <Box><Button variant="contained" onClick={async () => { await api.put('/settings/voice', voice); setSaved(true); }}>Save voice</Button></Box>
      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} message="Voice saved" />
    </Stack>
  );
}

function RulesTab() {
  const [rules, setRules] = useState(null);
  useEffect(() => {
    api.get('/settings/rules').then(setRules);
  }, []);
  if (!rules) return <CircularProgress />;
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Rules only apply to reviews that arrive after you turn them on. Editing a draft always cancels its auto-post.
      </Typography>
      <RulesEditor rules={rules} onChange={setRules} />
    </Stack>
  );
}

function ConnectionTab() {
  const { status, refreshStatus } = useOutletContext();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  if (!status) return <CircularProgress />;

  const disconnect = async () => {
    await api.delete('/google/connection');
    await refresh();
    navigate('/onboarding');
  };

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">{status.location?.title || 'No location'}</Typography>
                <Chip size="small" color={status.status === 'healthy' ? 'success' : 'warning'} label={status.status === 'healthy' ? 'Healthy' : 'Needs reconnect'} />
                {status.provider === 'mock' && <Chip size="small" variant="outlined" label="Demo data" />}
              </Stack>
              <Typography variant="body2" color="text.secondary">{status.location?.address}</Typography>
              <Typography variant="caption" color="text.secondary">
                {status.email} · last synced {status.location?.lastSyncedAt ? timeAgo(status.location.lastSyncedAt) : 'never'}
              </Typography>
            </Box>
            <Button
              variant="outlined" disabled={syncing}
              onClick={async () => { setSyncing(true); await api.post('/google/sync'); await refreshStatus(); setSyncing(false); }}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button color="error" onClick={() => setConfirm(true)}>Disconnect</Button>
          </Stack>
        </CardContent>
      </Card>
      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs">
        <DialogTitle>Disconnect Google?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            We&apos;ll revoke access and delete the reviews and replies we stored for this location. Replies already on Google stay there.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={disconnect}>Disconnect</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function ActivityTab() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get('/settings/activity').then(setRows);
  }, []);
  if (!rows) return <CircularProgress />;
  if (!rows.length) return <Typography color="text.secondary">No activity yet.</Typography>;
  return (
    <Card>
      <List disablePadding>
        {rows.map((r, i) => (
          <ListItem key={r.id} divider={i < rows.length - 1}>
            <ListItemText
              primary={ACTION_LABELS[r.action] || r.action}
              secondary={r.meta?.ruleName ? `Rule: ${r.meta.ruleName}` : null}
              primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
            />
            <Typography variant="caption" color="text.secondary">{timeAgo(r.createdAt)}</Typography>
          </ListItem>
        ))}
      </List>
    </Card>
  );
}

const TABS = [
  { key: 'voice', label: 'Reply voice', el: <VoiceTab /> },
  { key: 'rules', label: 'Auto-replies', el: <RulesTab /> },
  { key: 'connection', label: 'Google connection', el: <ConnectionTab /> },
  { key: 'activity', label: 'Activity', el: <ActivityTab /> },
];

export default function Settings() {
  const [tab, setTab] = useState('voice');
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5">Settings</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ my: 3, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
      </Tabs>
      {TABS.find((t) => t.key === tab).el}
    </Box>
  );
}
