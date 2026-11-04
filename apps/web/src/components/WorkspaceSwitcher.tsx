import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import UnfoldMoreRoundedIcon from '@mui/icons-material/UnfoldMoreRounded';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
} from '@mui/material';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function WorkspaceSwitcher() {
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
      <ListItemButton
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ px: 1, flexGrow: 0 }}
        aria-label="Switch workspace"
      >
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
          <MenuItem
            key={w.id}
            selected={w.id === workspace?.id}
            onClick={() => {
              switchWorkspace(w.id);
              setAnchor(null);
            }}
          >
            <ListItemIcon>
              {w.id === workspace?.id && <CheckRoundedIcon fontSize="small" />}
            </ListItemIcon>
            {w.name}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setCreating(true);
          }}
        >
          <ListItemIcon>
            <AddRoundedIcon fontSize="small" />
          </ListItemIcon>
          New workspace
        </MenuItem>
      </Menu>
      <Dialog open={creating} onClose={() => setCreating(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New workspace</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="contained" disabled={!name.trim()} onClick={create}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
