import type { ReviewStatus, ReviewTab } from '@replypilot/shared';
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Badge, Box, Button, Chip, CircularProgress, InputAdornment, List, ListItemButton, Menu, MenuItem, Pagination, Snackbar,
  Stack, Tab, Tabs, TextField, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useRefreshWorkspaceData, useReview, useReviews, useWorkspaceId, wsPath } from '../api/hooks';
import ReviewDetail from '../components/ReviewDetail';
import Stars from '../components/Stars';
import StatusChip from '../components/StatusChip';
import { timeAgo } from '../components/format';
import { managedLocations, useShell } from '../layout/ShellContext';

const TABS: { key: ReviewTab; label: string }[] = [
  { key: 'todo', label: 'To reply' },
  { key: 'posted', label: 'Posted' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'all', label: 'All' },
];
const STAR_FILTERS = [
  { key: '', label: 'All ratings' },
  { key: '1,2', label: '1–2★' },
  { key: '3', label: '3★' },
  { key: '4,5', label: '4–5★' },
];
const IN_MOTION: ReviewStatus[] = ['drafting', 'pending', 'posting'];
const PAGE_SIZE = 50;

interface SimulatedReview {
  stars?: number;
  text?: string;
}

export default function Inbox() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const workspaceId = useWorkspaceId();
  const refresh = useRefreshWorkspaceData();
  const { status, locationId } = useShell();
  const managed = managedLocations(status);
  const sampleLocation = managed.find((l) => l.id === locationId && l.sample) ?? (locationId ? undefined : managed.find((l) => l.sample));

  const [tab, setTab] = useState<ReviewTab>('todo');
  const [stars, setStars] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simMenu, setSimMenu] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [tab, stars, q, locationId, workspaceId]);
  useEffect(() => setSelectedId(null), [workspaceId, locationId]);

  const [poll, setPoll] = useState(false);
  const filters = useMemo(
    () => ({ tab, page, pageSize: PAGE_SIZE, locationId, stars: stars || undefined, q: q || undefined }),
    [tab, page, locationId, stars, q],
  );
  const { data, isLoading } = useReviews(filters, poll);
  const { data: detail } = useReview(selectedId, poll);

  // Refresh while anything is in motion, such as a draft being written or Google reviewing a reply.
  useEffect(() => {
    const moving = (data?.reviews ?? []).some((r) => IN_MOTION.includes(r.status)) || (detail ? IN_MOTION.includes(detail.status) : false);
    setPoll(moving);
  }, [data, detail]);

  // On desktop the first review opens by itself.
  useEffect(() => {
    if (desktop && data && !data.reviews.some((r) => r.id === selectedId) && !detail) {
      setSelectedId(data.reviews[0]?.id ?? null);
    }
  }, [data, desktop, selectedId, detail]);

  // j and k move through the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')) return;
      if (!data?.reviews.length || !['j', 'k'].includes(e.key)) return;
      const index = data.reviews.findIndex((r) => r.id === selectedId);
      const next = e.key === 'j' ? Math.min(index + 1, data.reviews.length - 1) : Math.max(index - 1, 0);
      setSelectedId(data.reviews[next]?.id ?? null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, selectedId]);

  const onUpdated = useCallback(() => void refresh(), [refresh]);

  const simulate = async (body: SimulatedReview) => {
    setSimMenu(null);
    if (!sampleLocation) return;
    await api.post(wsPath(workspaceId, '/dev/simulate-review'), { locationId: sampleLocation.id, ...body });
    setToast(`New review added to ${sampleLocation.title}`);
    setTab('todo');
    await refresh();
  };

  const showLocation = managed.length > 1 && !locationId;
  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const list = (
    <Stack sx={{ height: '100%', borderRight: { md: 1 }, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h5" sx={{ flex: 1 }}>Inbox</Typography>
          {sampleLocation && (
            <>
              <Button size="small" variant="outlined" startIcon={<AddCommentRoundedIcon />} onClick={(e) => setSimMenu(e.currentTarget)}>
                {desktop ? 'Simulate review' : 'Simulate'}
              </Button>
              <Menu anchorEl={simMenu} open={!!simMenu} onClose={() => setSimMenu(null)}>
                <MenuItem onClick={() => void simulate({})}>Random review</MenuItem>
                <MenuItem onClick={() => void simulate({ stars: 5, text: '' })}>5★ rating only</MenuItem>
                <MenuItem onClick={() => void simulate({ stars: 5, text: 'Fantastic experience. The team was lovely and everything was spotless!' })}>5★ with text</MenuItem>
                <MenuItem onClick={() => void simulate({ stars: 1, text: 'We arrived on time and still waited over an hour. Nobody apologized.' })}>1★ complaint</MenuItem>
              </Menu>
            </>
          )}
        </Stack>
        <TextField
          size="small" fullWidth placeholder="Search reviews" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
        />
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {STAR_FILTERS.map((f) => (
            <Chip
              key={f.key} label={f.label} size="small" clickable
              color={stars === f.key ? 'primary' : 'default'} variant={stars === f.key ? 'filled' : 'outlined'}
              onClick={() => setStars(f.key)}
            />
          ))}
        </Stack>
      </Box>
      <Tabs value={tab} onChange={(_, v: ReviewTab) => setTab(v)} variant="scrollable" sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
        {TABS.map((t) => (
          <Tab
            key={t.key} value={t.key} sx={{ minHeight: 40, px: 1.5 }}
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <span>{t.label}</span>
                {!!data?.counts[t.key] && t.key !== 'all' && (
                  <Badge
                    badgeContent={data.counts[t.key]} color={t.key === 'todo' ? 'primary' : 'default'} max={99}
                    sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
                  />
                )}
              </Stack>
            }
          />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {isLoading || !data ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : data.reviews.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ p: 6, color: 'text.secondary' }}>
            <InboxRoundedIcon sx={{ fontSize: 40 }} />
            <Typography variant="body2" align="center">
              {managed.length === 0 ? 'No locations yet. Ask an admin to give you access.' : tab === 'todo' ? 'All caught up. Nice work!' : 'Nothing here.'}
            </Typography>
          </Stack>
        ) : (
          <List disablePadding>
            {data.reviews.map((r) => (
              <ListItemButton
                key={r.id} selected={r.id === selectedId} onClick={() => setSelectedId(r.id)}
                sx={{ borderRadius: 0, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', alignItems: 'flex-start', display: 'block' }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Stars value={r.starRating} size={15} />
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{r.reviewerName ?? 'Reviewer'}</Typography>
                  <Typography variant="caption" color="text.secondary">{timeAgo(r.createTime)}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {r.comment ?? (r.purged ? 'Removed after 30 days' : 'Rating only')}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <StatusChip status={r.status} />
                  {showLocation && <Typography variant="caption" color="text.secondary" noWrap>{r.location.title}</Typography>}
                </Stack>
              </ListItemButton>
            ))}
          </List>
        )}
        {pages > 1 && (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <Pagination count={pages} page={page} onChange={(_, value) => setPage(value)} size="small" />
          </Stack>
        )}
      </Box>
    </Stack>
  );

  const detailPane = detail ? (
    <ReviewDetail review={detail} onUpdated={onUpdated} onBack={desktop ? null : () => setSelectedId(null)} />
  ) : (
    <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', color: 'text.secondary' }}>
      <Typography variant="body2">Select a review</Typography>
    </Stack>
  );

  return (
    <Box sx={{ height: { xs: 'calc(100vh - 64px)', md: '100vh' }, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '380px minmax(0, 1fr)' } }}>
      {desktop ? <>{list}<Box sx={{ minWidth: 0 }}>{detailPane}</Box></> : selectedId ? detailPane : list}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
