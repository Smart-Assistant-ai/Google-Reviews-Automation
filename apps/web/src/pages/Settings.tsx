import { hasAtLeast } from '@replypilot/shared';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthConfig, useBilling } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import AccountTab from './settings/AccountTab';
import ActivityTab from './settings/ActivityTab';
import BillingTab from './settings/BillingTab';
import GoogleTab from './settings/GoogleTab';
import TeamTab from './settings/TeamTab';
import VoiceTab from './settings/VoiceTab';
import WorkspaceTab from './settings/WorkspaceTab';

export default function Settings() {
  const { workspace } = useAuth();
  const isAdmin = workspace ? hasAtLeast(workspace.role, 'admin') : false;
  // Teammates join through an emailed invitation, so the tab waits until email is switched on.
  const emails = useAuthConfig().data?.emails === true;
  // Only the owner pays, and the tab stays hidden on a server with billing switched off. A plan
  // already loaded counts, even if a later reload failed. One that couldn't be loaded keeps the
  // tab, which says so and offers to try again. That is told by a failure having happened rather
  // than by the error itself, which clears while the tab asks again: the tab would vanish, come
  // back when the request failed, ask again, and so on.
  const isOwner = workspace?.role === 'owner';
  const billing = useBilling();
  const billingOn = billing.data ? billing.data.state !== 'free' : billing.errorUpdateCount > 0;

  // Controls a role can't use aren't shown. The API refuses them regardless.
  const tabs = useMemo(() => {
    const all: { key: string; label: string; el: ReactNode; show: boolean }[] = [
      { key: 'voice', label: 'Reply voice', el: <VoiceTab />, show: true },
      { key: 'google', label: 'Google & locations', el: <GoogleTab />, show: isAdmin },
      { key: 'team', label: 'Team', el: <TeamTab />, show: emails },
      { key: 'activity', label: 'Activity', el: <ActivityTab />, show: isAdmin },
      { key: 'workspace', label: 'Workspace', el: <WorkspaceTab />, show: isAdmin },
      { key: 'billing', label: 'Billing', el: <BillingTab />, show: isOwner && billingOn },
      { key: 'account', label: 'Your account', el: <AccountTab />, show: true },
    ];
    return all.filter((t) => t.show);
  }, [isAdmin, emails, isOwner, billingOn]);

  // The tab lives in the URL (/settings?tab=team), so it survives a refresh and can be linked to.
  // A tab this role can't see falls back to the usual first one.
  const [params, setParams] = useSearchParams();
  const fallback = isAdmin ? 'google' : 'voice';
  const tab =
    tabs.find((t) => t.key === params.get('tab')) ??
    tabs.find((t) => t.key === fallback) ??
    tabs[0]!;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5">Settings</Typography>
      <Tabs
        value={tab.key}
        onChange={(_, v: string) => setParams({ tab: v }, { replace: true })}
        variant="scrollable"
        sx={{ my: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>
      {tab.el}
    </Box>
  );
}
