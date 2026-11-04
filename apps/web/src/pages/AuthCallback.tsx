import { Box, CircularProgress } from '@mui/material';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Google sign-in lands here with the session cookie already set, so all that's left is to load it.
export default function AuthCallback() {
  const { restore } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get('invite');

  useEffect(() => {
    const next = invite ? `/invite?token=${encodeURIComponent(invite)}` : '/';
    void restore().then((me) => navigate(me ? next : '/login?error=google_failed', { replace: true }));
  }, [restore, navigate, invite]);

  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  );
}
