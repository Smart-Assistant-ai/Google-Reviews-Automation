import { Box, Divider, Skeleton, Stack } from '@mui/material';

// Placeholders shaped like the real list and review, so the page doesn't jump when they arrive.
export function ReviewListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box aria-busy aria-label="Loading reviews">
      {Array.from({ length: rows }, (_, i) => (
        <Box key={i} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Skeleton variant="rounded" width={75} height={15} />
            <Skeleton width={`${40 + ((i * 17) % 30)}%`} sx={{ flex: 1 }} />
            <Skeleton width={36} />
          </Stack>
          <Skeleton sx={{ mt: 0.5 }} />
          <Skeleton width={`${55 + ((i * 23) % 35)}%`} />
          <Skeleton variant="rounded" width={84} height={24} sx={{ mt: 1, borderRadius: 4 }} />
        </Box>
      ))}
    </Box>
  );
}

export function ReviewDetailSkeleton() {
  return (
    <Stack aria-busy aria-label="Loading review" sx={{ height: '100%' }}>
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton variant="circular" width={44} height={44} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="35%" height={28} />
            <Skeleton width="50%" />
          </Box>
          <Skeleton variant="rounded" width={96} height={32} sx={{ borderRadius: 4 }} />
        </Stack>
        <Box sx={{ mt: 3 }}>
          <Skeleton height={26} />
          <Skeleton height={26} />
          <Skeleton height={26} width="70%" />
        </Box>
      </Box>
      <Divider />
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        <Skeleton width={120} sx={{ mb: 1.5 }} />
        <Skeleton variant="rounded" height={140} />
      </Box>
    </Stack>
  );
}
