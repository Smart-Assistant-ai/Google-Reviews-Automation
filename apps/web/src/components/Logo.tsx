import { Box, Typography } from '@mui/material';
import { brand } from '../theme';

export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
      <Box
        component="svg"
        viewBox="0 0 32 32"
        sx={{ width: size, height: size, flexShrink: 0 }}
        aria-hidden
      >
        <rect width="32" height="32" rx="8" fill={brand.main} />
        <path d="M9 10h14v9H15l-4 4v-4H9z" fill="white" />
        <path
          d="M16 12.2l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"
          fill={brand.star}
        />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
        ReplyPilot
      </Typography>
    </Box>
  );
}
