import { hasAtLeast } from '@replypilot/shared';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import AccountTab from './settings/AccountTab';
import ActivityTab from './settings/ActivityTab';
import GoogleTab from './settings/GoogleTab';
import TeamTab from './settings/TeamTab';
import VoiceTab from './settings/VoiceTab';
import WorkspaceTab from './settings/WorkspaceTab';

export default function Settings() {
  const { workspace } = useAuth();
  const isAdmin = workspace ? hasAtLeast(workspace.role, 'admin') : false;

  // Controls a role can't use aren't shown. The API refuses them regardless.
  const tabs = useMemo(() => {
    const all: { key: string; label: string; el: ReactNode; show: boolean }[] = [
      { key: 'voice', label: 'Reply voice', el: <VoiceTab />, show: true },
      { key: 'google', label: 'Google & locations', el: <GoogleTab />, show: isAdmin },
      { key: 'team', label: 'Team', el: <TeamTab />, show: true },
      { key: 'activity', label: 'Activity', el: <ActivityTab />, show: isAdmin },
      { key: 'workspace', label: 'Workspace', el: <WorkspaceTab />, show: isAdmin },
      { key: 'account', label: 'Your account', el: <AccountTab />, show: true },
    ];
    return all.filter((t) => t.show);
  }, [isAdmin]);

  const [selected, setSelected] = useState(isAdmin ? 'google' : 'voice');
  const tab = tabs.find((t) => t.key === selected) ?? tabs[0]!;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5">Settings</Typography>
      <Tabs value={tab.key} onChange={(_, v: string) => setSelected(v)} variant="scrollable" sx={{ my: 3, borderBottom: 1, borderColor: 'divider' }}>
        {tabs.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
      </Tabs>
      {tab.el}
    </Box>
  );
}
