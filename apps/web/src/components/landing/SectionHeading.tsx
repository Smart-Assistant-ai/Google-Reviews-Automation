import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

// The centred heading that opens each section of the home page: a small label, then the title.
export default function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 640, mx: 'auto' }}>
      <Typography
        variant="overline"
        color="primary"
        sx={{ fontWeight: 700, letterSpacing: '0.12em' }}
      >
        {eyebrow}
      </Typography>
      <Typography
        variant="h4"
        component="h2"
        sx={{ mt: 0.5, fontSize: { xs: '1.75rem', md: '2.25rem' } }}
      >
        {title}
      </Typography>
      {children && (
        <Typography color="text.secondary" sx={{ mt: 1.5 }}>
          {children}
        </Typography>
      )}
    </Box>
  );
}
