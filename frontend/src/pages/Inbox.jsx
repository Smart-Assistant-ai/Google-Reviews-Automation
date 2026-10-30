import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Badge, Box, Button, Chip, InputAdornment, List, ListItemButton, Menu, MenuItem, Snackbar, Stack, Tab, Tabs,
  TextField, Typography, useMediaQuery, CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import Stars from '../components/Stars';
import StatusChip from '../components/StatusChip';
import ReviewDetail from '../components/ReviewDetail';
import { timeAgo } from '../components/format';
import api from '../api/client';

const TABS = [
  { key: 'todo', label: 'To reply' },
  { key: 'scheduled', label: 'Auto-posting' },
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
const LIVE_STATES = ['drafting', 'scheduled', 'pending', 'posting'];

export default function Inbox() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const { status: connection } = useOutletContext();
  const [tab, setTab] = useState('todo');
  const [stars, setStars] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [simMenu, setSimMenu] = useState(null);
  const [toast, setToast] = useState('');
  const selectedRef = useRef(null);

  const load = useCallback(async () => {
    const res = await api.get('/reviews', { params: { tab, stars: stars || undefined, q: q || undefined } });
    setData(res);
    return res;
  }, [tab, stars, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // Auto-select the first review on desktop.
  useEffect(() => {
    if (desktop && data && !data.reviews.find((r) => r.id === selectedId)) {
      if (!selectedRef.current || !data.reviews.length) setSelectedId(data.reviews[0]?.id || null);
    }
  }, [data, desktop, selectedId]);

  const [detail, setDetail] = useState(null);
  useEffect(() => {
    selectedRef.current = selectedId;
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.get(`/reviews/${selectedId}`).then(setDetail).catch(() => setDetail(null));
  }, [selectedId]);

  // Poll while anything is in motion (drafting, scheduled, waiting on Google moderation).
  const busy = useMemo(
    () => (data?.reviews || []).some((r) => LIVE_STATES.includes(r.status)) || LIVE_STATES.includes(detail?.status),
    [data, detail],
  );
  useEffect(() => {
    if (!busy) return undefined;
    const t = setInterval(async () => {
      await load();
      if (selectedRef.current) api.get(`/reviews/${selectedRef.current}`).then(setDetail).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  // j / k to move through the list.
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (!data?.reviews.length || !['j', 'k'].includes(e.key)) return;
      const idx = data.reviews.findIndex((r) => r.id === selectedId);
      const next = e.key === 'j' ? Math.min(idx + 1, data.reviews.length - 1) : Math.max(idx - 1, 0);
      setSelectedId(data.reviews[next].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, selectedId]);

  const onUpdated = (updated) => {
    setDetail(updated);
    load();
  };

  const simulate = async (body) => {
    setSimMenu(null);
    const res = await api.post('/dev/simulate-review', body);
    setToast(`New ${res.review.starRating ? '' : ''}review from ${res.review.reviewer.displayName}`);
    setTab('todo');
    await load();
  };

  const list = (
    <Stack sx={{ height: '100%', borderRight: { md: 1 }, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h5" sx={{ flex: 1 }}>Inbox</Typography>
          {connection?.provider === 'mock' && (
            <>
              <Button size="small" variant="outlined" startIcon={<AddCommentRoundedIcon />} onClick={(e) => setSimMenu(e.currentTarget)}>
                {desktop ? 'Simulate review' : 'Simulate'}
              </Button>
              <Menu anchorEl={simMenu} open={!!simMenu} onClose={() => setSimMenu(null)}>
                <MenuItem onClick={() => simulate({})}>Random review</MenuItem>
                <MenuItem onClick={() => simulate({ stars: 5, text: '' })}>5★ rating only</MenuItem>
                <MenuItem onClick={() => simulate({ stars: 5, text: 'Fantastic dinner tonight — the margherita was perfect and the staff were lovely!' })}>5★ with text</MenuItem>
                <MenuItem onClick={() => simulate({ stars: 1, text: 'Ordered at 8, food came at 9:15 and it was cold. Nobody apologised.' })}>1★ complaint</MenuItem>
              </Menu>
            </>
          )}
        </Stack>
        <TextField
          size="small" fullWidth placeholder="Search reviews" value={q} onChange={(e) => setQ(e.target.value)}
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
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
        {TABS.map((t) => (
          <Tab
            key={t.key} value={t.key} sx={{ minHeight: 40, px: 1.5 }}
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <span>{t.label}</span>
                {data?.counts?.[t.key] > 0 && t.key !== 'all' && (
                  <Badge badgeContent={data.counts[t.key]} color={t.key === 'todo' ? 'primary' : 'default'} max={99}
                    sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }} />
                )}
              </Stack>
            }
          />
        ))}
      </Tabs>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {!data ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : data.reviews.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ p: 6, color: 'text.secondary' }}>
            <InboxRoundedIcon sx={{ fontSize: 40 }} />
            <Typography variant="body2">{tab === 'todo' ? 'All caught up. Nice work!' : 'Nothing here.'}</Typography>
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
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{r.reviewerName}</Typography>
                  <Typography variant="caption" color="text.secondary">{timeAgo(r.createTime)}</Typography>
                </Stack>
                <Typography
                  variant="body2" color="text.secondary"
                  sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {r.comment || 'Rating only'}
                </Typography>
                <Box sx={{ mt: 1 }}><StatusChip status={r.status} /></Box>
              </ListItemButton>
            ))}
          </List>
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
