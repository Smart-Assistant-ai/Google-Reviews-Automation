import { GOOGLE_REPLY_MAX_BYTES as MAX_BYTES, byteLength, type Review } from '@replypilot/shared';
import { useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, Divider, IconButton, Link, Menu, MenuItem, Skeleton, Stack, TextField, Tooltip,
  Typography, type ChipProps,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import OutlinedFlagRoundedIcon from '@mui/icons-material/OutlinedFlagRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import Stars from './Stars';
import StatusChip from './StatusChip';
import { LANGUAGE_NAMES, timeAgo } from './format';
import { api } from '../api/client';
import { useWorkspaceId, wsPath } from '../api/hooks';

const REWRITES = [
  { label: 'Regenerate', instructions: undefined },
  { label: 'Make it shorter', instructions: 'Make it shorter, 1-2 sentences.' },
  { label: 'More apologetic', instructions: 'Be more apologetic and empathetic.' },
  { label: 'More formal', instructions: 'Use a more formal, professional tone.' },
  { label: 'Mention a return visit', instructions: 'Warmly invite them to visit again.' },
];
const VIOLATIONS: Record<string, string> = {
  PROMOTIONAL_CONTENT: 'Replies cannot offer discounts, coupons or free items.',
  CONTACT_INFORMATION: 'Replies cannot contain phone numbers or links.',
};
const SENTIMENT_COLOR: Record<string, ChipProps['color']> = { positive: 'success', neutral: 'default', negative: 'error' };

interface Props {
  review: Review;
  onUpdated: (review: Review) => void;
  onBack: (() => void) | null;
}

export default function ReviewDetail({ review, onUpdated, onBack }: Props) {
  const workspaceId = useWorkspaceId();
  const path = wsPath(workspaceId, `/reviews/${review.id}/reply`);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [editingPosted, setEditingPosted] = useState(false);

  const reply = review.reply;
  const status = review.status;
  useEffect(() => {
    setText(reply?.text || '');
    setError('');
    setEditingPosted(false);
  }, [review.id, reply?.text, reply?.state]);

  const run = async (key: string, fn: () => Promise<Review>) => {
    setBusy(key);
    setError('');
    try {
      const updated = await fn();
      onUpdated(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  };

  const regenerate = (instructions?: string) => run('regen', () => api.post<Review>(`${path}/regenerate`, { instructions }));
  const post = () => run('post', () => api.post<Review>(`${path}/post`, { text }));
  const saveDraft = () => run('save', () => api.put<Review>(path, { text }));
  const remove = () => run('delete', () => api.delete<Review>(path));

  const bytes = byteLength(text);
  const posted = ['pending', 'live', 'posting'].includes(status);
  const editable = ['draft', 'rejected', 'failed', 'needs_reply', 'backlog'].includes(status) || editingPosted;
  const dirty = text !== (reply?.text || '');

  return (
    <Stack sx={{ height: '100%', overflowY: 'auto' }}>
      <Box sx={{ p: { xs: 2, md: 4 } }}>
        {onBack && (
          <Button startIcon={<ArrowBackRoundedIcon />} onClick={onBack} sx={{ mb: 2, ml: -1 }}>All reviews</Button>
        )}
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar src={review.reviewerPhotoUrl || undefined} sx={{ bgcolor: 'primary.main', width: 44, height: 44 }}>
            {(review.reviewerName ?? '?')[0]}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap>{review.reviewerName ?? 'Reviewer'}</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Stars value={review.starRating} />
              <Typography variant="body2" color="text.secondary">{timeAgo(review.createTime)} · {review.location.title}</Typography>
            </Stack>
          </Box>
          <StatusChip status={status} size="medium" />
        </Stack>

        <Typography sx={{ mt: 3, fontSize: 17, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {review.comment ?? (
            <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              {review.purged ? 'Removed after 30 days, as Google requires. It comes back if Google still lists this review.' : 'Rating only, no written review.'}
            </Box>
          )}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
          {review.sentiment && <Chip size="small" label={review.sentiment} color={SENTIMENT_COLOR[review.sentiment] ?? 'default'} variant="outlined" />}
          {review.language && review.language !== 'en' && <Chip size="small" label={LANGUAGE_NAMES[review.language] ?? review.language} variant="outlined" />}
          {review.topics.map((t) => <Chip key={t} size="small" label={t} />)}
        </Stack>
      </Box>

      <Divider />

      <Box sx={{ p: { xs: 2, md: 4 }, flex: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {status === 'rejected' && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Google rejected this reply{reply?.policyViolation ? ` (${reply.policyViolation.replace(/_/g, ' ').toLowerCase()})` : ''}.
            {' '}{(reply?.policyViolation && VIOLATIONS[reply.policyViolation]) || 'Edit it and post again.'}
          </Alert>
        )}
        {status === 'failed' && <Alert severity="error" sx={{ mb: 2 }}>Couldn&apos;t post: {reply?.error}</Alert>}

        {status === 'pending' && (
          <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
            Posted. Google is reviewing the reply; this usually takes a few minutes.
          </Alert>
        )}
        {status === 'live' && (
          <Alert severity="success" variant="outlined" sx={{ mb: 2 }}>
            Live on Google{reply?.source === 'google' ? ' · replied before ReplyPilot' : ''}.
          </Alert>
        )}

        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <AutoAwesomeRoundedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {posted && !editingPosted ? 'Your reply' : reply?.source === 'human' ? 'Your draft' : 'AI draft'}
          </Typography>
          {editable && (
            <>
              <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={(e) => setMenu(e.currentTarget)} disabled={!!busy}>
                Rewrite
              </Button>
              <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
                {REWRITES.map((r) => (
                  <MenuItem key={r.label} onClick={() => { setMenu(null); void regenerate(r.instructions); }}>{r.label}</MenuItem>
                ))}
              </Menu>
            </>
          )}
          {posted && !editingPosted && (
            <>
              <Tooltip title="Edit reply"><IconButton size="small" onClick={() => setEditingPosted(true)}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Delete reply from Google"><IconButton size="small" onClick={() => void remove()} disabled={!!busy}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
            </>
          )}
        </Stack>

        {status === 'drafting' || busy === 'regen' ? (
          <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Skeleton width="90%" /><Skeleton width="95%" /><Skeleton width="60%" />
            <Typography variant="caption" color="text.secondary">Writing a reply in your voice…</Typography>
          </Box>
        ) : !reply && !text && !editable ? null : (
          <>
            {!reply && (status === 'needs_reply' || status === 'backlog') && !text ? (
              <Stack direction="row" spacing={1.5}>
                <Button variant="contained" startIcon={<AutoAwesomeRoundedIcon />} onClick={() => void regenerate()} disabled={!!busy}>
                  Draft reply with AI
                </Button>
                <Button onClick={() => setText(' ')}>Write my own</Button>
              </Stack>
            ) : (
              <>
                <TextField
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  multiline minRows={5} fullWidth
                  disabled={!editable}
                  placeholder="Write a reply…"
                />
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="caption" color={bytes > MAX_BYTES ? 'error' : 'text.secondary'} sx={{ flex: 1 }}>
                    {bytes} / {MAX_BYTES} bytes
                  </Typography>
                  {editable && (
                    <>
                      {dirty && <Button onClick={() => void saveDraft()} disabled={!!busy}>Save draft</Button>}
                      {editingPosted && <Button onClick={() => { setEditingPosted(false); setText(reply?.text || ''); }}>Cancel</Button>}
                      <Button
                        variant="contained" endIcon={<SendRoundedIcon />} onClick={() => void post()}
                        disabled={!!busy || !text.trim() || bytes > MAX_BYTES}
                      >
                        {editingPosted ? 'Update reply' : 'Post reply'}
                      </Button>
                    </>
                  )}
                </Stack>
              </>
            )}
          </>
        )}

        <Link
          href="https://support.google.com/business/answer/4596773" target="_blank" rel="noopener"
          variant="body2" color="text.secondary" underline="hover"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 4 }}
        >
          <OutlinedFlagRoundedIcon fontSize="inherit" /> Report this review to Google
        </Link>
      </Box>
    </Stack>
  );
}
