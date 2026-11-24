import { Box, Paper, type SxProps, type Theme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { float, noMotion } from './motion';

// A small label that bobs beside the sample review. Wide screens only: on a phone there is no space
// beside the card. `delay` (seconds, negative) keeps two notes from bobbing in step.
export default function FloatingNote({
  icon,
  children,
  delay = 0,
  sx,
}: {
  icon: ReactNode;
  children: ReactNode;
  delay?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Paper
      aria-hidden
      sx={[
        (theme) => ({
          position: 'absolute',
          zIndex: 2,
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          gap: 1,
          pl: 0.75,
          pr: 1.5,
          py: 0.75,
          borderRadius: '12px',
          border: 1,
          borderColor: 'divider',
          typography: 'body2',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 12px 30px rgba(0,0,0,0.4)'
              : '0 12px 30px rgba(22,24,29,0.10)',
          animation: `${float} 6s ease-in-out ${delay}s infinite`,
          [noMotion]: { animation: 'none' },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={(theme) => ({
          display: 'grid',
          placeItems: 'center',
          width: 28,
          height: 28,
          borderRadius: '8px',
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.12),
          '& svg': { fontSize: 18 },
        })}
      >
        {icon}
      </Box>
      {children}
    </Paper>
  );
}
