import { hasAtLeast } from '@replypilot/shared';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonBase,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FullPageLoader from '../components/FullPageLoader';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthConfig, useBilling, useGoogleStatus, useTodoCount } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';
import OutboxLink from '../components/OutboxLink';
import { plural } from '../components/format';
import WorkspaceSwitcher from '../components/WorkspaceSwitcher';
import { useColorMode } from '../theme/ColorModeContext';
import { ShellContext, managedLocations } from './ShellContext';

const WIDTH = 256;
const APP_NAME = 'ReplyPilot';
const NAV = [
  { to: '/inbox', label: 'Inbox', icon: <InboxRoundedIcon />, showCount: true },
  { to: '/dashboard', label: 'Dashboard', icon: <InsightsRoundedIcon /> },
  { to: '/settings', label: 'Settings', icon: <TuneRoundedIcon /> },
];

function ConnectionWarnings() {
  const { workspace } = useAuth();
  const { data: status } = useGoogleStatus();
  if (!status || !workspace || !hasAtLeast(workspace.role, 'admin')) return null;
  const dead = status.connections.filter((c) => c.status === 'needs_reconnect').length;
  const lost = status.locations.filter((l) => l.status === 'access_lost').length;
  const sample = status.connections.some((c) => c.sample || c.provider === 'mock');
  // Covers Google refusing the app and an account with no Business Profile alike, so it names
  // neither. The Google tab, where the box leads, gives the exact reason.
  const waiting = status.connections.some((c) => c.apiError && !c.sample);
  if (!dead && !lost && !sample && !waiting) return null;
  // Every warning is fixed on the Google tab, so the box takes you there.
  return (
    <ButtonBase
      component={NavLink}
      to="/settings?tab=google"
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: 'action.hover',
        display: 'block',
        textAlign: 'left',
        '&:hover': { bgcolor: 'action.selected' },
      }}
    >
      {dead > 0 && (
        <Typography variant="caption" color="warning.main" component="div" sx={{ fontWeight: 600 }}>
          Google needs reconnecting
        </Typography>
      )}
      {lost > 0 && (
        <Typography variant="caption" color="warning.main" component="div" sx={{ fontWeight: 600 }}>
          {plural(lost, 'location')} lost access
        </Typography>
      )}
      {waiting && (
        <Typography variant="caption" color="text.secondary" component="div">
          A Google account needs attention
        </Typography>
      )}
      {sample && (
        <Typography variant="caption" color="text.secondary" component="div">
          Using sample data
        </Typography>
      )}
      <Typography variant="caption" color="primary" component="div" sx={{ mt: 0.5 }}>
        Open Google settings
      </Typography>
    </ButtonBase>
  );
}

function EmailBanner() {
  const { session } = useAuth();
  const { data: config } = useAuthConfig();
  const [sent, setSent] = useState(false);
  // With email off there is nothing to confirm, and nothing waits on it.
  if (!session || session.user.emailVerified || !config?.emails) return null;
  return (
    <Alert
      severity="warning"
      sx={{ borderRadius: 0 }}
      action={
        <Button
          color="inherit"
          size="small"
          disabled={sent}
          onClick={async () => {
            await api.post('/auth/resend-verification');
            setSent(true);
          }}
        >
          {sent ? 'Sent' : 'Send again'}
        </Button>
      }
    >
      Confirm your email to connect Google and post replies. We sent a link to {session.user.email}.
      <OutboxLink />
    </Alert>
  );
}

// Says when drafting has stopped, or is about to, and who can fix it. Only the owner can pay.
function BillingBanner() {
  const { workspace } = useAuth();
  const { data: billing } = useBilling();
  const location = useLocation();
  if (!billing || !workspace) return null;
  const owner = workspace.role === 'owner';
  const onBilling =
    location.pathname.startsWith('/settings') && location.search.includes('tab=billing');
  const action = owner && !onBilling && (
    <Button color="inherit" size="small" component={NavLink} to="/settings?tab=billing">
      {billing.state === 'past_due' ? 'Update card' : 'Choose a plan'}
    </Button>
  );
  const ask = owner ? '' : ' Ask the workspace owner to sort out the plan.';
  if (billing.state === 'lapsed') {
    return (
      <Alert severity="warning" sx={{ borderRadius: 0 }} action={action}>
        This workspace has no active plan, so replies can&apos;t be drafted or posted. Your reviews
        are all still here.{ask}
      </Alert>
    );
  }
  if (billing.state === 'past_due') {
    return (
      <Alert severity="warning" sx={{ borderRadius: 0 }} action={action}>
        The last payment didn&apos;t go through. Stripe will try again.{ask}
      </Alert>
    );
  }
  const left = billing.trialEndsAt
    ? Math.ceil((Date.parse(billing.trialEndsAt) - Date.now()) / 864e5)
    : Infinity;
  if (billing.state === 'trial' && left <= 3) {
    return (
      <Alert severity="info" sx={{ borderRadius: 0 }} action={action}>
        {/* Less than a day can still run into tomorrow, so it isn't called "today". */}
        {left <= 1
          ? 'Your free trial ends within a day.'
          : `${plural(left, 'day')} left in your free trial.`}{' '}
        Choose a plan to keep drafting and posting replies.{ask}
      </Alert>
    );
  }
  return null;
}

export default function AppShell() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const { session, workspace, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const location = useLocation();
  const { data: status, isLoading } = useGoogleStatus();
  const [locationId, setLocationId] = useState<string | undefined>();
  const managed = useMemo(() => managedLocations(status), [status]);
  const { data: todo = 0 } = useTodoCount(locationId);
  const page = NAV.find((item) => location.pathname.startsWith(item.to))?.label;

  // The tab says where you are and how many reviews wait, so it's useful among other tabs.
  useEffect(() => {
    const name = page ? `${page} · ${APP_NAME}` : APP_NAME;
    document.title = todo > 0 ? `(${todo > 99 ? '99+' : todo}) ${name}` : name;
  }, [page, todo]);
  useEffect(
    () => () => {
      document.title = APP_NAME;
    },
    [],
  );

  // Pages scroll inside the content area, so the sidebar and the inbox panes stay put.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  // A location from the workspace we just left must not stay selected.
  useEffect(() => setLocationId(undefined), [workspace?.id]);
  useEffect(() => {
    if (locationId && status && !managed.some((l) => l.id === locationId)) setLocationId(undefined);
  }, [locationId, managed, status]);

  const shell = useMemo(() => ({ status, locationId, setLocationId }), [status, locationId]);

  if (!workspace) return <Navigate to="/no-workspace" replace />;
  const isAdmin = hasAtLeast(workspace.role, 'admin');
  const onSettings = location.pathname.startsWith('/settings');
  // An admin with nothing connected yet goes to onboarding. Until that's known, the inbox or
  // dashboard would show for a moment and then vanish, so nothing shows.
  if (isAdmin && !onSettings && isLoading) return <FullPageLoader />;
  if (!isLoading && status && isAdmin && managed.length === 0 && !onSettings)
    return <Navigate to="/onboarding" replace />;

  const nav = (
    <Stack sx={{ height: '100%', p: 2 }} spacing={1.5}>
      <Box sx={{ px: 1, py: 0.5 }}>
        <Logo />
      </Box>
      <WorkspaceSwitcher />
      {managed.length > 1 && (
        <TextField
          select
          size="small"
          label="Location"
          value={locationId ?? 'all'}
          onChange={(e) => setLocationId(e.target.value === 'all' ? undefined : e.target.value)}
        >
          <MenuItem value="all">All locations ({managed.length})</MenuItem>
          {managed.map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.title}
            </MenuItem>
          ))}
        </TextField>
      )}
      <List sx={{ flex: 1 }} disablePadding>
        {NAV.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            selected={location.pathname.startsWith(item.to)}
            sx={{ mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
            />
            {item.showCount && todo > 0 && (
              <Box
                component="span"
                aria-label={`${todo} to reply`}
                sx={{
                  minWidth: 22,
                  height: 20,
                  px: 0.75,
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                }}
              >
                {todo > 99 ? '99+' : todo}
              </Box>
            )}
          </ListItemButton>
        ))}
      </List>
      <ConnectionWarnings />
      <Divider />
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {session?.user.name ?? session?.user.email}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {session?.user.email}
          </Typography>
        </Box>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton size="small" onClick={toggle}>
            {mode === 'dark' ? (
              <LightModeRoundedIcon fontSize="small" />
            ) : (
              <DarkModeRoundedIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <Tooltip title="Log out">
          <IconButton size="small" onClick={() => void logout()} aria-label="Log out">
            <LogoutRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  return (
    <ShellContext.Provider value={shell}>
      <Box
        sx={{
          display: 'flex',
          height: '100dvh',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {desktop ? (
          <Box
            component="nav"
            sx={{
              width: WIDTH,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            {nav}
          </Box>
        ) : (
          <>
            <AppBar
              position="fixed"
              color="inherit"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
              elevation={0}
            >
              <Toolbar>
                <IconButton
                  edge="start"
                  onClick={() => setOpen(true)}
                  sx={{ mr: 1 }}
                  aria-label="Open menu"
                >
                  <MenuRoundedIcon />
                </IconButton>
                <Logo size={24} />
              </Toolbar>
            </AppBar>
            <Drawer
              open={open}
              onClose={() => setOpen(false)}
              PaperProps={{ sx: { width: WIDTH } }}
            >
              {nav}
            </Drawer>
          </>
        )}
        <Box
          component="main"
          sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          {!desktop && <Toolbar />}
          <EmailBanner />
          <BillingBanner />
          <Box ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </ShellContext.Provider>
  );
}
