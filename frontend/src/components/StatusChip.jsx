import { Chip } from '@mui/material';

const MAP = {
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

export default function StatusChip({ status, size = 'small' }) {
  const s = MAP[status] || MAP.needs_reply;
  return <Chip size={size} label={s.label} color={s.color} variant={s.color === 'default' ? 'outlined' : 'filled'} />;
}
