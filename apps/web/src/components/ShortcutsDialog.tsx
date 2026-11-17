import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['j'], label: 'Next review' },
  { keys: ['k'], label: 'Previous review' },
  { keys: ['/'], label: 'Search reviews' },
  { keys: ['Esc'], label: 'Leave the search box' },
  { keys: ['?'], label: 'Show these shortcuts' },
];

export function Kbd({ children }: { children: string }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-block',
        minWidth: 22,
        px: 0.75,
        py: 0.125,
        border: 1,
        borderColor: 'divider',
        borderBottomWidth: 2,
        borderRadius: 1,
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.6,
        textAlign: 'center',
        color: 'text.secondary',
        bgcolor: 'action.hover',
      }}
    >
      {children}
    </Box>
  );
}

export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogContent>
        <Stack spacing={1.25}>
          {SHORTCUTS.map((s) => (
            <Stack key={s.label} direction="row" alignItems="center" spacing={2}>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {s.label}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
