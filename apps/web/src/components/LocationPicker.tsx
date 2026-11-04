import type { Location } from '@replypilot/shared';
import {
  Alert,
  Button,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';

interface Props {
  locations: Location[];
  submitLabel: string;
  busy?: boolean;
  error?: string;
  onSubmit: (ids: string[]) => void;
}

// The one place a person chooses which locations to manage. Nothing is managed until they do.
export default function LocationPicker({ locations, submitLabel, busy, error, onSubmit }: Props) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const allChosen = chosen.size === locations.length;

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };

  return (
    <Stack spacing={1.5} sx={{ alignSelf: 'stretch' }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" alignItems="center">
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {chosen.size} of {locations.length} chosen
        </Typography>
        <Button
          size="small"
          onClick={() => setChosen(allChosen ? new Set() : new Set(locations.map((l) => l.id)))}
        >
          {allChosen ? 'Clear' : 'Choose all'}
        </Button>
      </Stack>
      <List
        disablePadding
        sx={{
          maxHeight: 360,
          overflowY: 'auto',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
        }}
      >
        {locations.map((location) => (
          <ListItem key={location.id} disablePadding divider>
            <ListItemButton onClick={() => toggle(location.id)} dense sx={{ borderRadius: 0 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Checkbox
                  edge="start"
                  checked={chosen.has(location.id)}
                  tabIndex={-1}
                  disableRipple
                  inputProps={{ 'aria-label': location.title }}
                />
              </ListItemIcon>
              <ListItemText
                primary={location.title}
                secondary={[location.address, location.connectionEmail].filter(Boolean).join(' · ')}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Button
        variant="contained"
        size="large"
        disabled={busy || chosen.size === 0}
        onClick={() => onSubmit([...chosen])}
      >
        {busy ? 'Loading reviews…' : submitLabel}
      </Button>
    </Stack>
  );
}
