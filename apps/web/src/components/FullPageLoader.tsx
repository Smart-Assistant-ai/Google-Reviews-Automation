import { Box, CircularProgress } from '@mui/material';

// Shown while the app works out which page someone should see, so no page flashes on the way.
export default function FullPageLoader() {
  return (
    <Box sx={{ height: '100dvh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}
