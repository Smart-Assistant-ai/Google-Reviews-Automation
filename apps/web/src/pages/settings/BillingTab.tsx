import {
  PRICING,
  TRIAL_HOLD_MIN_HOURS,
  planTotal,
  type BillingInterval,
  type BillingStatus,
} from '@replypilot/shared';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useBilling, useWorkspaceId, wsPath } from '../../api/hooks';
import { plural } from '../../components/format';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));

const LIVE = ['active', 'trialing', 'past_due'];
// Plans Stripe still holds open without them giving access, mostly ones whose payments failed for
// good. Choosing a new plan closes the old one once the new one starts.
const STALLED = ['unpaid', 'paused', 'incomplete'];

// Stripe can't hold the first charge for a trial ending sooner than the server's limit. The page
// stops promising the hold a little before that, to allow for the owner's clock being off and the
// time spent reading before choosing. Choosing in between still gets the hold, which Stripe's page
// shows as nothing due today.
const HOLD_SHOWN_MS = TRIAL_HOLD_MIN_HOURS * 3_600_000 + 15 * 60_000;

// Draws again once the time `at` passes, so wording that depends on the clock doesn't go stale in
// a tab left open.
function useRedrawAt(at: number | null) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (at === null || at <= Date.now()) return;
    const timer = setTimeout(() => redraw((n) => n + 1), Math.min(at - Date.now(), 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [at]);
}

// What the plan is now, in a sentence or two.
function PlanSummary({ billing }: { billing: BillingStatus }) {
  const { plan, state } = billing;
  const holdEnds =
    state === 'trial' && billing.trialEndsAt
      ? Date.parse(billing.trialEndsAt) - HOLD_SHOWN_MS
      : null;
  useRedrawAt(holdEnds);
  const live = plan && LIVE.includes(plan.status);
  if (live && plan) {
    const what = `${plan.interval === 'year' ? 'Yearly' : 'Monthly'} plan for ${plural(plan.quantity ?? billing.locations, 'location')}.`;
    let when = '';
    if (plan.renewsAt && plan.cancelAtPeriodEnd) when = `It ends on ${day(plan.renewsAt)}.`;
    else if (plan.renewsAt && plan.status === 'trialing')
      when = `The first charge is on ${day(plan.renewsAt)}, when the free trial ends.`;
    else if (plan.renewsAt) when = `It renews on ${day(plan.renewsAt)}.`;
    return (
      <Stack spacing={1}>
        <Typography>
          {what} {when}
        </Typography>
        {state === 'past_due' && (
          <Alert severity="warning">
            The last payment didn&apos;t go through. Stripe will try again over the next few days.
            Update the card in Manage billing to keep drafting and posting replies.
          </Alert>
        )}
      </Stack>
    );
  }
  if (state === 'trial' && billing.trialEndsAt) {
    const left = daysLeft(billing.trialEndsAt);
    const holds = holdEnds !== null && Date.now() < holdEnds;
    return (
      <Typography>
        Free trial: {plural(left, 'day')} left, until {day(billing.trialEndsAt)}.{' '}
        {holds
          ? 'Choose a plan any time; nothing is charged until the trial ends.'
          : 'With the trial this close to its end, a plan chosen now starts, and is charged, today.'}
      </Typography>
    );
  }
  const stalled = plan && STALLED.includes(plan.status);
  return (
    <Alert severity="warning">
      {stalled
        ? "Your plan is on hold in Stripe, usually because its payments didn't go through, so"
        : 'This workspace has no active plan, so'}{' '}
      replies can&apos;t be drafted or posted. Your reviews, replies and settings are all still
      here. Choose a plan to carry on
      {stalled ? '; the old one is closed when the new one starts' : ''}.
    </Alert>
  );
}

function PlanChoice({
  interval,
  locations,
  busy,
  onChoose,
}: {
  interval: BillingInterval;
  locations: number;
  busy: boolean;
  onChoose: () => void;
}) {
  const total = planTotal(locations, interval);
  const saved = planTotal(locations, 'month') * 12 - planTotal(locations, 'year');
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1.5} alignItems="flex-start">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={600}>
              {interval === 'year' ? 'Yearly' : 'Monthly'}
            </Typography>
            {interval === 'year' && <Chip size="small" color="primary" label={`Save $${saved}`} />}
          </Stack>
          <Typography variant="h4" component="p" fontWeight={700}>
            ${total}
            <Typography component="span" color="text.secondary">
              {' '}
              / {interval}
            </Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            For {plural(Math.max(1, locations), 'location')}
            {interval === 'year' ? `, ${12 - PRICING.yearlyMonths} months free` : ''}
          </Typography>
          <Button
            variant={interval === 'year' ? 'contained' : 'outlined'}
            disabled={busy}
            onClick={onChoose}
          >
            Choose {interval === 'year' ? 'yearly' : 'monthly'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function BillingTab() {
  const workspaceId = useWorkspaceId();
  const { data: billing, isLoading, isError, refetch } = useBilling();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Back from Stripe's checkout or portal: read the result now rather than waiting for Stripe's
  // webhook, so a new plan, a switch to yearly or a cancellation shows straight away.
  const sessionId = params.get('checkout');
  const fromPortal = params.get('from') === 'portal';
  const returning = sessionId ?? (fromPortal ? 'portal' : null);
  const confirmed = useRef<string | null>(null);
  useEffect(() => {
    if (!returning || !workspaceId || confirmed.current === returning) return;
    confirmed.current = returning;
    const request = sessionId
      ? api.post<BillingStatus>(wsPath(workspaceId, '/billing/checkout/confirm'), { sessionId })
      : api.post<BillingStatus>(wsPath(workspaceId, '/billing/refresh'));
    request
      .then((status) => {
        queryClient.setQueryData(['billing', workspaceId], status);
        if (sessionId) setDone(true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setParams({ tab: 'billing' }, { replace: true }));
  }, [returning, sessionId, workspaceId, queryClient, setParams]);

  // Both go to Stripe's own pages, so card details never touch ReplyPilot.
  const go = async (path: string, body?: object) => {
    setBusy(true);
    setError('');
    try {
      const { url } = await api.post<{ url: string }>(wsPath(workspaceId, path), body);
      window.location.assign(url);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (isError && !billing && !returning) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      >
        Your plan couldn&apos;t be loaded just now.
      </Alert>
    );
  }

  if (isLoading || !billing || returning) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const live = billing.plan && LIVE.includes(billing.plan.status);
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent>
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="subtitle2">Your plan</Typography>
            <PlanSummary billing={billing} />
            {billing.plan && (
              <>
                <Button
                  variant={live ? 'contained' : 'outlined'}
                  disabled={busy}
                  onClick={() => go('/billing/portal')}
                >
                  Manage billing
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {live
                    ? "Change the card, switch between monthly and yearly, download invoices or cancel, on Stripe's secure page."
                    : "See past invoices or change the card on Stripe's secure page."}
                </Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {!live && (
        <Box>
          <Grid container spacing={2}>
            {(['month', 'year'] as const).map((interval) => (
              <Grid item xs={12} sm={6} key={interval}>
                <PlanChoice
                  interval={interval}
                  locations={billing.locations}
                  busy={busy}
                  onChoose={() => go('/billing/checkout', { interval })}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Stack spacing={1}>
        <Typography variant="subtitle2">How the price works</Typography>
        {[
          `$${PRICING.firstLocation} a month for the first location, $${PRICING.upToCutoff} for each location up to ${PRICING.cutoff}, and $${PRICING.afterCutoff} for each one after that.`,
          `You're charged for the ${plural(billing.locations, 'location')} connected now. Adding or removing one changes the price within minutes, prorated to the day.`,
          `A year costs ${PRICING.yearlyMonths} months. Cards are handled by Stripe, and you can cancel any time.`,
        ].map((line) => (
          <Stack key={line} direction="row" spacing={1} alignItems="flex-start">
            <CheckRoundedIcon fontSize="small" color="primary" sx={{ mt: 0.25 }} />
            <Typography variant="body2" color="text.secondary">
              {line}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Snackbar
        open={done}
        autoHideDuration={5000}
        onClose={() => setDone(false)}
        message="Thanks! Your plan is set up."
      />
    </Stack>
  );
}
