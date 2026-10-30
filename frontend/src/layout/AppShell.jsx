import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Box, Divider, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography,
  useMediaQuery, Drawer, AppBar, Toolbar,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import Logo from '../components/Logo';
import { useAuth } from '../auth/AuthContext';
import { useColorMode } from '../theme/ColorModeContext';
import api from '../api/client';

const WIDTH = 240;
const NAV = [
  { to: '/inbox', label: 'Inbox', icon: <InboxRoundedIcon /> },
  { to: '/dashboard', label: 'Dashboard', icon: <InsightsRoundedIcon /> },
  { to: '/settings', label: 'Settings', icon: <TuneRoundedIcon /> },
];

function ConnectionBadge({ status }) {
  if (!status) return null;
  const healthy = status.connected && status.status === 'healthy';
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: healthy ? 'success.main' : 'warning.main' }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {healthy ? 'Google connected' : 'Needs reconnect'}
        </Typography>
        {status.provider === 'mock' && (
          <Typography variant="caption" color="text.secondary">· demo</Typography>
        )}
      </Stack>
      {status.location && (
        <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ mt: 0.5 }}>
          {status.location.title}
        </Typography>
      )}
    </Box>
  );
}

export default function AppShell() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const { session, logout } = useAuth();
  const { mode, toggle } = useColorMode();
  const location = useLocation();

  useEffect(() => {
    api.get('/google/status').then(setStatus).catch(() => {});
    setOpen(false);
  }, [location.pathname]);

  const nav = (
    <Stack sx={{ height: '100%', p: 2 }} spacing={2}>
      <Box sx={{ px: 1, py: 0.5 }}><Logo /></Box>
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
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
          </ListItemButton>
        ))}
      </List>
      <ConnectionBadge status={status} />
      <Divider />
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{session?.user.name || session?.user.email}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">{session?.workspace.name}</Typography>
        </Box>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton size="small" onClick={toggle}>
            {mode === 'dark' ? <LightModeRoundedIcon fontSize="small" /> : <DarkModeRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Log out">
          <IconButton size="small" onClick={logout}><LogoutRoundedIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {desktop ? (
        <Box
          component="nav"
          sx={{ width: WIDTH, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, height: '100vh' }}
        >
          {nav}
        </Box>
      ) : (
        <>
          <AppBar position="fixed" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider' }} elevation={0}>
            <Toolbar>
              <IconButton edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }}><MenuRoundedIcon /></IconButton>
              <Logo size={24} />
            </Toolbar>
          </AppBar>
          <Drawer open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: WIDTH } }}>{nav}</Drawer>
        </>
      )}
      <Box component="main" sx={{ flex: 1, minWidth: 0, pt: desktop ? 0 : 8 }}>
        <Outlet context={{ status, refreshStatus: () => api.get('/google/status').then(setStatus) }} />
      </Box>
    </Box>
  );
}
