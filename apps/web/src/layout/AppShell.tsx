import { hasAtLeast } from '@replypilot/shared';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UnfoldMoreRoundedIcon from '@mui/icons-material/UnfoldMoreRounded';
import {
  Alert, AppBar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, TextField, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useGoogleStatus } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';
import { useColorMode } from '../theme/ColorModeContext';
import { ShellContext, managedLocations } from './ShellContext';

const WIDTH = 256;
const NAV = [
  { to: '/inbox', label: 'Inbox', icon: <InboxRoundedIcon /> },
  { to: '/dashboard', label: 'Dashboard', icon: <InsightsRoundedIcon /> },
  { to: '/settings', label: 'Settings', icon: <TuneRoundedIcon /> },
];

function WorkspaceSwitcher() {
  const { session, workspace, switchWorkspace, reload } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const create = async () => {
    try {
      const created = await api.post<{ id: string }>('/workspaces', { name });
      await reload();
      switchWorkspace(created.id);
      setCreating(false);
      setName('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <ListItemButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ px: 1, flexGrow: 0 }} aria-label="Switch workspace">
        <ListItemText
          primary={workspace?.name}
          primaryTypographyProps={{ fontWeight: 600, fontSize: 14, noWrap: true }}
          secondary={workspace?.role}
          secondaryTypographyProps={{ fontSize: 12, sx: { textTransform: 'capitalize' } }}
        />
        <UnfoldMoreRoundedIcon fontSize="small" color="action" />
      </ListItemButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {session?.workspaces.map((w) => (
          <MenuItem key={w.id} selected={w.id === workspace?.id} onClick={() => { switchWorkspace(w.id); setAnchor(null); }}>
            <ListItemIcon>{w.id === workspace?.id && <CheckRoundedIcon fontSize="small" />}</ListItemIcon>
            {w.name}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setCreating(true); }}>
          <ListItemIcon><AddRoundedIcon fontSize="small" /></ListItemIcon>
          New workspace
        </MenuItem>
      </Menu>
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New workspace</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField autoFocus fullWidth label="Business name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={create}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function ConnectionWarnings() {
  const { workspace } = useAuth();
  const { data: status } = useGoogleStatus();
  if (!status || !workspace || !hasAtLeast(workspace.role, 'admin')) return null;
  const dead = status.connections.filter((c) => c.status === 'needs_reconnect').length;
  const lost = status.locations.filter((l) => l.status === 'access_lost').length;
  const sample = status.connections.some((c) => c.sample || c.provider === 'mock');
  if (!dead && !lost && !sample) return null;
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
      {dead > 0 && <Typography variant="caption" color="warning.main" component="div" sx={{ fontWeight: 600 }}>Google needs reconnecting</Typography>}
      {lost > 0 && <Typography variant="caption" color="warning.main" component="div" sx={{ fontWeight: 600 }}>{lost} location{lost > 1 ? 's' : ''} lost access</Typography>}
      {sample && <Typography variant="caption" color="text.secondary" component="div">Using sample data</Typography>}
    </Box>
  );
}

function EmailBanner() {
  const { session } = useAuth();
  const [sent, setSent] = useState(false);
  if (!session || session.user.emailVerified) return null;
  return (
    <Alert
      severity="warning"
      sx={{ borderRadius: 0 }}
      action={<Button color="inherit" size="small" disabled={sent} onClick={async () => { await api.post('/auth/resend-verification'); setSent(true); }}>{sent ? 'Sent' : 'Send again'}</Button>}
    >
      Confirm your email to connect Google and post replies. We sent a link to {session.user.email}.
    </Alert>
  );
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

  useEffect(() => setOpen(false), [location.pathname]);
  // A location from the workspace we just left must not stay selected.
  useEffect(() => setLocationId(undefined), [workspace?.id]);
  useEffect(() => {
    if (locationId && status && !managed.some((l) => l.id === locationId)) setLocationId(undefined);
  }, [locationId, managed, status]);

  const shell = useMemo(() => ({ status, locationId, setLocationId }), [status, locationId]);

  if (!workspace) return <Navigate to="/no-workspace" replace />;
  const isAdmin = hasAtLeast(workspace.role, 'admin');
  const onSettings = location.pathname.startsWith('/settings');
  if (!isLoading && status && isAdmin && managed.length === 0 && !onSettings) return <Navigate to="/onboarding" replace />;

  const nav = (
    <Stack sx={{ height: '100%', p: 2 }} spacing={1.5}>
      <Box sx={{ px: 1, py: 0.5 }}><Logo /></Box>
      <WorkspaceSwitcher />
      {managed.length > 1 && (
        <TextField
          select size="small" label="Location" value={locationId ?? 'all'}
          onChange={(e) => setLocationId(e.target.value === 'all' ? undefined : e.target.value)}
        >
          <MenuItem value="all">All locations ({managed.length})</MenuItem>
          {managed.map((l) => <MenuItem key={l.id} value={l.id}>{l.title}</MenuItem>)}
        </TextField>
      )}
      <List sx={{ flex: 1 }} disablePadding>
        {NAV.map((item) => (
          <ListItemButton key={item.to} component={NavLink} to={item.to} selected={location.pathname.startsWith(item.to)} sx={{ mb: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
          </ListItemButton>
        ))}
      </List>
      <ConnectionWarnings />
      <Divider />
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{session?.user.name ?? session?.user.email}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">{session?.user.email}</Typography>
        </Box>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton size="small" onClick={toggle}>
            {mode === 'dark' ? <LightModeRoundedIcon fontSize="small" /> : <DarkModeRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Log out">
          <IconButton size="small" onClick={() => void logout()} aria-label="Log out"><LogoutRoundedIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  return (
    <ShellContext.Provider value={shell}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        {desktop ? (
          <Box component="nav" sx={{ width: WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, height: '100vh' }}>
            {nav}
          </Box>
        ) : (
          <>
            <AppBar position="fixed" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }} elevation={0}>
              <Toolbar>
                <IconButton edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }} aria-label="Open menu"><MenuRoundedIcon /></IconButton>
                <Logo size={24} />
              </Toolbar>
            </AppBar>
            <Drawer open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: WIDTH } }}>{nav}</Drawer>
          </>
        )}
        <Box component="main" sx={{ flex: 1, minWidth: 0, pt: desktop ? 0 : 7 }}>
          <EmailBanner />
          <Outlet />
        </Box>
      </Box>
    </ShellContext.Provider>
  );
}

