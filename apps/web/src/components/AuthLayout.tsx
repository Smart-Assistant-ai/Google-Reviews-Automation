import { Box, Container } from '@mui/material';
import type { ReactNode } from 'react';
import Logo from './Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        <Logo />
        <Box sx={{ mt: 5 }}>{children}</Box>
      </Container>
    </Box>
  );
}
