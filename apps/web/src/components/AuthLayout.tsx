import { Box, Container, Link } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Logo from './Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
      <Container maxWidth="sm">
        {/* The way back from pages reached by an email link, such as the local inbox. */}
        <Link
          component={RouterLink}
          to="/"
          underline="none"
          color="inherit"
          aria-label="ReplyPilot home"
        >
          <Logo />
        </Link>
        <Box sx={{ mt: 5 }}>{children}</Box>
      </Container>
    </Box>
  );
}
