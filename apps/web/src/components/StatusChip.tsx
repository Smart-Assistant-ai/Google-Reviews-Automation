import type { ReviewStatus } from '@replypilot/shared';
import { Chip, type ChipProps } from '@mui/material';

const MAP: Record<ReviewStatus, { label: string; color: ChipProps['color'] }> = {
  needs_reply: { label: 'Needs reply', color: 'default' },
  backlog: { label: 'Backlog', color: 'default' },
  drafting: { label: 'Drafting…', color: 'default' },
  draft: { label: 'Draft ready', color: 'primary' },
  posting: { label: 'Posting…', color: 'default' },
  pending: { label: 'Google reviewing', color: 'warning' },
  live: { label: 'Live', color: 'success' },
  rejected: { label: 'Rejected by Google', color: 'error' },
  failed: { label: 'Failed to post', color: 'error' },
};

export default function StatusChip({
  status,
  size = 'small',
}: {
  status: ReviewStatus;
  size?: ChipProps['size'];
}) {
  const s = MAP[status];
  return (
    <Chip
      size={size}
      label={s.label}
      color={s.color}
      variant={s.color === 'default' ? 'outlined' : 'filled'}
    />
  );
}
