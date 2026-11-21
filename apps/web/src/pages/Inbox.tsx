import { reviewTabSchema, uuidSchema, type ReviewStatus, type ReviewTab } from '@replypilot/shared';
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import {
  Badge,
  Box,
  Button,
  Chip,
  InputAdornment,
  List,
  ListItemButton,
  Menu,
  MenuItem,
  Pagination,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import {
  useRefreshWorkspaceData,
  useReview,
  useReviews,
  useWorkspaceId,
  wsPath,
} from '../api/hooks';
import GoogleEmptyState from '../components/GoogleEmptyState';
import Highlight from '../components/Highlight';
import ReviewDetail from '../components/ReviewDetail';
import { ReviewDetailSkeleton, ReviewListSkeleton } from '../components/ReviewSkeletons';
import ShortcutsDialog, { Kbd } from '../components/ShortcutsDialog';
import Stars from '../components/Stars';
import StatusChip from '../components/StatusChip';
import { timeAgo } from '../components/format';
import { useAuth } from '../auth/AuthContext';
import { managedLocations, useShell } from '../layout/ShellContext';
import { hasAtLeast } from '@replypilot/shared';

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
const PAGE_SIZE = 25;

// The URL holds the view, so a refresh or a shared link opens the same tab, filters and review.
function readView(params: URLSearchParams) {
  const tab = reviewTabSchema.safeParse(params.get('tab'));
  const stars = params.get('stars') ?? '';
  const page = Number(params.get('page'));
  // Review IDs are UUIDs. Anything else is ignored rather than trusted: the inbox builds a page
  // lookup from the ID, and a stray quote would break it.
  const review = uuidSchema.safeParse(params.get('review'));
  return {
    tab: tab.success ? tab.data : 'todo',
    stars: STAR_FILTERS.some((f) => f.key === stars) ? stars : '',
    q: params.get('q')?.slice(0, 200) ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    review: review.success ? review.data : null,
  };
}

interface SimulatedReview {
  stars?: number;
  text?: string;
}

// Why the inbox shows no reviews, said on the right where the open review would be.
function emptyInbox(view: {
  hasLocations: boolean;
  filtered: boolean;
  anyReviews: boolean;
  tab: ReviewTab;
}): { Icon: typeof InboxRoundedIcon; title: string; body: string } {
  if (!view.hasLocations)
    return {
      Icon: InboxRoundedIcon,
      title: 'No locations yet',
      body: 'Ask an admin to give you access to a location, and its reviews will show up here.',
    };
  if (view.filtered)
    return {
      Icon: SearchOffRoundedIcon,
      title: 'No reviews match',
      body: 'Try another search or star rating.',
    };
  if (!view.anyReviews)
    return {
      Icon: InboxRoundedIcon,
      title: 'No reviews yet',
      body: 'New Google reviews show up here as soon as they arrive.',
    };
  if (view.tab === 'todo')
    return {
      Icon: TaskAltRoundedIcon,
      title: 'All caught up',
      body: 'Every review has a reply. New ones show up here as they arrive.',
    };
  if (view.tab === 'posted')
    return {
      Icon: InboxRoundedIcon,
      title: 'No posted replies yet',
      body: 'Replies you post to Google show up here.',
    };
  return {
    Icon: InboxRoundedIcon,
    title: 'No backlog',
    body: 'Reviews older than 30 days that still need a reply show up here.',
  };
}

export default function Inbox() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('md'));
  const workspaceId = useWorkspaceId();
  const refresh = useRefreshWorkspaceData();
  const { status, locationId } = useShell();
  const managed = managedLocations(status);
  const sampleLocation =
    managed.find((l) => l.id === locationId && l.sample) ??
    (locationId ? undefined : managed.find((l) => l.sample));

  const [params, setParams] = useSearchParams();
  const [initial] = useState(() => readView(params));
  const [tab, setTab] = useState<ReviewTab>(initial.tab);
  const [stars, setStars] = useState(initial.stars);
  const [search, setSearch] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [page, setPage] = useState(initial.page);
  const [selectedId, setSelectedId] = useState<string | null>(initial.review);
  const [simMenu, setSimMenu] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState('');
  const [shortcuts, setShortcuts] = useState(false);
  // Which review to open once j or k has turned the page, and the page that's for.
  const [pageEdge, setPageEdge] = useState<{ edge: 'first' | 'last'; page: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // A new filter starts at its first page and opens its first match, rather than keeping a review
  // the list no longer shows. The first render keeps what the URL asked for. This runs while
  // rendering, so the list never asks for a page or review from the filter before.
  const filterKey = [workspaceId, locationId, tab, stars, q].join('|');
  const [seenFilterKey, setSeenFilterKey] = useState(filterKey);
  if (filterKey !== seenFilterKey) {
    setSeenFilterKey(filterKey);
    setPage(1);
    setSelectedId(null);
  }

  // The URL can change without the inbox changing it, for example with the back button or the
  // Inbox link in the sidebar. Then the inbox shows the view the URL asks for, page and review
  // included. A URL the inbox wrote itself is never read back, so it can't undo a newer change.
  const query = params.toString();
  const [seenQuery, setSeenQuery] = useState(query);
  const lastWritten = useRef(query);
  if (query !== seenQuery) {
    setSeenQuery(query);
    if (query !== lastWritten.current) {
      const view = readView(params);
      setTab(view.tab);
      setStars(view.stars);
      setSearch(view.q);
      setQ(view.q);
      setPage(view.page);
      setSelectedId(view.review);
      // These are the URL's own filters, so they don't reset its page and review.
      setSeenFilterKey([workspaceId, locationId, view.tab, view.stars, view.q].join('|'));
    }
  }

  useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== 'todo') next.set('tab', tab);
    if (stars) next.set('stars', stars);
    if (q) next.set('q', q);
    if (page > 1) next.set('page', String(page));
    if (selectedId) next.set('review', selectedId);
    // Once the URL shows what's on screen, it counts as written here, so going back to an older
    // URL is still noticed as a change.
    lastWritten.current = next.toString();
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [tab, stars, q, page, selectedId, params, setParams]);

  const [poll, setPoll] = useState(false);
  const filters = useMemo(
    () => ({
      tab,
      page,
      pageSize: PAGE_SIZE,
      locationId,
      stars: stars || undefined,
      q: q || undefined,
    }),
    [tab, page, locationId, stars, q],
  );
  // While a new filter loads, the old list stays on screen as a placeholder.
  const { data, isLoading, isPlaceholderData } = useReviews(filters, poll);
  const {
    data: detail,
    isError: detailMissing,
    error: detailError,
    isFetching: detailFetching,
    refetch: retryDetail,
  } = useReview(selectedId, poll);

  // Refresh while anything is in motion, such as a draft being written or Google reviewing a reply.
  useEffect(() => {
    const moving =
      (data?.reviews ?? []).some((r) => IN_MOTION.includes(r.status)) ||
      (detail ? IN_MOTION.includes(detail.status) : false);
    setPoll(moving);
  }, [data, detail]);

  // Only the API saying the review is gone or out of reach means it won't come back. A network
  // or server error may pass, so the review stays open with its Try again button.
  const reviewGone =
    detailMissing &&
    detailError instanceof ApiError &&
    [400, 403, 404].includes(detailError.status);

  // On desktop the first review opens by itself. A linked review that no longer exists, or that
  // this person can't see, falls back to the list.
  useEffect(() => {
    if (!data || isPlaceholderData || (selectedId && !detail && !reviewGone)) return;
    if (!desktop) {
      if (reviewGone) setSelectedId(null);
      return;
    }
    if (!data.reviews.some((r) => r.id === selectedId) && !detail) {
      setSelectedId(data.reviews[0]?.id ?? null);
    }
  }, [data, isPlaceholderData, desktop, selectedId, detail, reviewGone]);

  // A linked page past the end, for example after reviews were answered, shows the last one.
  useEffect(() => {
    if (data && !isPlaceholderData && data.total > 0 && page > Math.ceil(data.total / PAGE_SIZE)) {
      setPage(Math.ceil(data.total / PAGE_SIZE));
    }
  }, [data, isPlaceholderData, page]);

  // j and k move through the list, / jumps to search and ? lists the shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName ?? '')) {
        if (e.key === 'Escape' && active === searchRef.current) active?.blur();
        return;
      }
      // Keys pressed inside a dialog, such as a confirmation, belong to that dialog.
      if (active?.closest('[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === '?') {
        setShortcuts(true);
        return;
      }
      // The physical key counts, so j and k work with Caps Lock or Shift on, and on keyboards
      // whose letters aren't Latin. The letter is only a fallback, for a key event with no code.
      // Autofill sends key events with no key at all.
      const key = e.key?.toLowerCase();
      const step =
        e.code === 'KeyJ' ? 1 : e.code === 'KeyK' ? -1 : key === 'j' ? 1 : key === 'k' ? -1 : 0;
      // While a page is still loading, the list on screen is the old one, so wait for it.
      if (!data?.reviews.length || !step || isPlaceholderData) return;
      const index = data.reviews.findIndex((r) => r.id === selectedId);
      const next = index + step;
      // Past either end of the page, the next or previous page opens at the review next in line.
      if (index !== -1 && next >= data.reviews.length) {
        if (page < Math.ceil(data.total / PAGE_SIZE)) {
          setPageEdge({ edge: 'first', page: page + 1 });
          setPage(page + 1);
        }
        return;
      }
      if (index !== -1 && next < 0) {
        if (page > 1) {
          setPageEdge({ edge: 'last', page: page - 1 });
          setPage(page - 1);
        }
        return;
      }
      setSelectedId(data.reviews[Math.max(next, 0)]?.id ?? null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, isPlaceholderData, selectedId, page]);

  // Once the page j or k turned to has loaded, open its first or last review. If another page
  // took its place first, for example from the page numbers, the turn is forgotten.
  useEffect(() => {
    if (!pageEdge) return;
    if (pageEdge.page !== page) {
      setPageEdge(null);
      return;
    }
    if (!data || isPlaceholderData) return;
    setPageEdge(null);
    const review =
      pageEdge.edge === 'first' ? data.reviews[0] : data.reviews[data.reviews.length - 1];
    if (review) setSelectedId(review.id);
  }, [pageEdge, page, data, isPlaceholderData]);

  // The list scrolls on its own, so the page and the open review stay where they are.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [page, tab, stars, q, locationId]);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-review-id="${selectedId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onUpdated = useCallback(() => void refresh(), [refresh]);

  const simulate = async (body: SimulatedReview) => {
    setSimMenu(null);
    if (!sampleLocation) return;
    await api.post(wsPath(workspaceId, '/dev/simulate-review'), {
      locationId: sampleLocation.id,
      ...body,
    });
    setToast(`New review added to ${sampleLocation.title}`);
    setTab('todo');
    await refresh();
  };

  const showLocation = managed.length > 1 && !locationId;

  // Connected, but Google is refusing to send reviews, so there's nothing to read. Admins get the
  // choice of sample data, as before. Everyone else is told what they're waiting for.
  const { workspace } = useAuth();
  const waitingOn = status?.connections.find((c) => c.apiError && !c.sample);
  const noReviewsAtAll = data?.counts.all === 0 && !q && !stars;
  if (waitingOn && noReviewsAtAll) {
    if (workspace && hasAtLeast(workspace.role, 'admin'))
      return <GoogleEmptyState connection={waitingOn} />;
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">{waitingOn.apiError}</Typography>
      </Box>
    );
  }
  const pages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const firstShown = (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, data?.total ?? 0);

  const list = (
    <Stack
      sx={{
        height: '100%',
        minHeight: 0,
        borderRight: { md: 1 },
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="h5" sx={{ flex: 1 }}>
            Inbox
          </Typography>
          {sampleLocation && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddCommentRoundedIcon />}
                onClick={(e) => setSimMenu(e.currentTarget)}
              >
                {desktop ? 'Simulate review' : 'Simulate'}
              </Button>
              <Menu anchorEl={simMenu} open={!!simMenu} onClose={() => setSimMenu(null)}>
                <MenuItem onClick={() => void simulate({})}>Random review</MenuItem>
                <MenuItem onClick={() => void simulate({ stars: 5, text: '' })}>
                  5★ rating only
                </MenuItem>
                <MenuItem
                  onClick={() =>
                    void simulate({
                      stars: 5,
                      text: 'Fantastic experience. The team was lovely and everything was spotless!',
                    })
                  }
                >
                  5★ with text
                </MenuItem>
                <MenuItem
                  onClick={() =>
                    void simulate({
                      stars: 1,
                      text: 'We arrived on time and still waited over an hour. Nobody apologized.',
                    })
                  }
                >
                  1★ complaint
                </MenuItem>
              </Menu>
            </>
          )}
        </Stack>
        <TextField
          size="small"
          fullWidth
          placeholder="Search reviews"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputRef={searchRef}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment:
              desktop && !search ? (
                <InputAdornment position="end">
                  <Kbd>/</Kbd>
                </InputAdornment>
              ) : undefined,
          }}
        />
        <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
          {STAR_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              clickable
              color={stars === f.key ? 'primary' : 'default'}
              variant={stars === f.key ? 'filled' : 'outlined'}
              onClick={() => setStars(f.key)}
            />
          ))}
        </Stack>
      </Box>
      <Tabs
        value={tab}
        onChange={(_, v: ReviewTab) => setTab(v)}
        variant="fullWidth"
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.key}
            value={t.key}
            sx={{ minHeight: 40, minWidth: 0, px: 0.5, fontSize: 13, whiteSpace: 'nowrap' }}
            label={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <span>{t.label}</span>
                {!!data?.counts[t.key] && t.key !== 'all' && (
                  <Badge
                    badgeContent={data.counts[t.key]}
                    color={t.key === 'todo' ? 'primary' : 'default'}
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        position: 'static',
                        transform: 'none',
                        fontSize: 11,
                        height: 18,
                        minWidth: 18,
                        px: 0.5,
                      },
                    }}
                  />
                )}
              </Stack>
            }
          />
        ))}
      </Tabs>
      <Box ref={listRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {isLoading || !data ? (
          <ReviewListSkeleton />
        ) : data.reviews.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ p: 6, color: 'text.secondary' }}>
            <InboxRoundedIcon sx={{ fontSize: 40 }} />
            <Typography variant="body2" align="center">
              {managed.length === 0
                ? 'No locations yet. Ask an admin to give you access.'
                : tab === 'todo'
                  ? 'All caught up. Nice work!'
                  : 'Nothing here.'}
            </Typography>
          </Stack>
        ) : (
          <List disablePadding>
            {data.reviews.map((r) => (
              <ListItemButton
                key={r.id}
                data-review-id={r.id}
                selected={r.id === selectedId}
                onClick={() => setSelectedId(r.id)}
                sx={{
                  borderRadius: 0,
                  px: 2,
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  alignItems: 'flex-start',
                  display: 'block',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Stars value={r.starRating} size={15} />
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                    <Highlight text={r.reviewerName ?? 'Reviewer'} query={q} />
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {timeAgo(r.createTime)}
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mt: 0.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {r.comment ? (
                    <Highlight text={r.comment} query={q} />
                  ) : r.purged ? (
                    'Removed after 30 days'
                  ) : (
                    'Rating only'
                  )}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  <StatusChip status={r.status} />
                  {showLocation && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {r.location.title}
                    </Typography>
                  )}
                </Stack>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      {!!data?.total && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ px: 2, py: 1, minHeight: 48, borderTop: 1, borderColor: 'divider' }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {firstShown}–{lastShown} of {data.total}
          </Typography>
          {pages > 1 && (
            <Pagination
              count={pages}
              page={page}
              onChange={(_, value) => setPage(value)}
              size="small"
              siblingCount={0}
              boundaryCount={1}
            />
          )}
        </Stack>
      )}
    </Stack>
  );

  // With no review to show, the right side says why, instead of asking to pick one.
  const empty =
    data && !isPlaceholderData && data.reviews.length === 0
      ? emptyInbox({
          hasLocations: managed.length > 0,
          filtered: Boolean(q || stars),
          anyReviews: data.counts.all > 0,
          tab,
        })
      : null;

  const detailPane = detail ? (
    <ReviewDetail
      review={detail}
      highlight={q}
      onUpdated={onUpdated}
      onBack={desktop ? null : () => setSelectedId(null)}
    />
  ) : detailMissing ? (
    // Retries are off, so a review that failed to load says so instead of loading forever. The
    // selection stays, so the next review isn't opened in its place. On a phone this pane fills
    // the screen, so it also offers the way back to the list.
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ height: '100%', p: 4, color: 'text.secondary', textAlign: 'center' }}
    >
      <ErrorOutlineRoundedIcon sx={{ fontSize: 36 }} />
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
        Couldn&apos;t load this review
      </Typography>
      <Typography variant="body2">{detailError?.message}</Typography>
      <Stack direction="row" spacing={1}>
        {!desktop && (
          <Button
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            onClick={() => setSelectedId(null)}
          >
            All reviews
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          onClick={() => void retryDetail()}
          disabled={detailFetching}
        >
          Try again
        </Button>
      </Stack>
    </Stack>
  ) : selectedId ? (
    <ReviewDetailSkeleton />
  ) : empty ? (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1}
      sx={{ height: '100%', p: 4, color: 'text.secondary', textAlign: 'center' }}
    >
      <empty.Icon sx={{ fontSize: 40 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.primary' }}>
        {empty.title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 360 }}>
        {empty.body}
      </Typography>
      {(q || stars) && (
        <Button
          size="small"
          variant="outlined"
          sx={{ mt: 1 }}
          onClick={() => {
            setSearch('');
            setQ('');
            setStars('');
          }}
        >
          Clear search and filters
        </Button>
      )}
    </Stack>
  ) : (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ height: '100%', color: 'text.secondary' }}
    >
      <Typography variant="body2">Select a review</Typography>
    </Stack>
  );

  return (
    <Box
      sx={{
        height: '100%',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '380px minmax(0, 1fr)' },
        // Without a bounded row the grid grows to fit every review and the whole page scrolls.
        gridTemplateRows: 'minmax(0, 1fr)',
        overflow: 'hidden',
      }}
    >
      {desktop ? (
        <>
          {list}
          <Box sx={{ minWidth: 0, minHeight: 0, height: '100%' }}>{detailPane}</Box>
        </>
      ) : selectedId ? (
        detailPane
      ) : (
        list
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
    </Box>
  );
}
