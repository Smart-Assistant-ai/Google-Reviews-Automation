import { Box, Button, Container, Divider, Link, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { COMPANY, CONTACT_EMAIL } from '../legal';
import Logo from './Logo';

// The pages anyone can read without an account: the home page, the privacy policy and the terms.
export default function PublicLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box component="header" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Container
          maxWidth="lg"
          sx={{ py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            color="inherit"
            aria-label="ReplyPilot home"
          >
            <Logo />
          </Link>
          <Stack direction="row" spacing={1}>
            {session ? (
              <Button variant="contained" component={RouterLink} to="/inbox">
                Open ReplyPilot
              </Button>
            ) : (
              <>
                <Button component={RouterLink} to="/login">
                  Log in
                </Button>
                <Button variant="contained" component={RouterLink} to="/signup">
                  Create account
                </Button>
              </>
            )}
          </Stack>
        </Container>
      </Box>
      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>
      <Divider />
      <Container
        component="footer"
        maxWidth="lg"
        sx={{
          py: 3,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          © {new Date().getFullYear()} {COMPANY}. ReplyPilot is not made or endorsed by Google.
        </Typography>
        <Stack direction="row" spacing={2.5} useFlexGap flexWrap="wrap">
          <Link component={RouterLink} to="/privacy" variant="body2" color="text.secondary">
            Privacy policy
          </Link>
          <Link component={RouterLink} to="/terms" variant="body2" color="text.secondary">
            Terms of service
          </Link>
          <Link href={`mailto:${CONTACT_EMAIL}`} variant="body2" color="text.secondary">
            {CONTACT_EMAIL}
          </Link>
        </Stack>
      </Container>
    </Box>
  );
}

// A long legal page: a title, the date it last changed, then numbered sections.
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <PublicLayout>
      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 4 }}>
          Last updated {updated}
        </Typography>
        <Stack
          spacing={2}
          sx={{
            '& h2': { mt: 2 },
            '& p, & li': { color: 'text.secondary', lineHeight: 1.7 },
            '& ul': { pl: 3, my: 0 },
          }}
        >
          {children}
        </Stack>
      </Container>
    </PublicLayout>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section">
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}
