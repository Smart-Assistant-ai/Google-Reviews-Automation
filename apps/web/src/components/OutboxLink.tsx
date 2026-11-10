import { Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthConfig } from '../api/hooks';

// Shown only while emails aren't really sent on this machine, so links are one click away
// instead of buried in the server logs.
export default function OutboxLink({ label = 'Open the local inbox' }: { label?: string }) {
  const { data: config } = useAuthConfig();
  if (!config?.devOutbox) return null;
  return (
    <Link component={RouterLink} to="/dev/outbox" target="_blank" sx={{ ml: 1, fontWeight: 600 }}>
      {label}
    </Link>
  );
}
