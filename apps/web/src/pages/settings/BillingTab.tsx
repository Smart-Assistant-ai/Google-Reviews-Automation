import { PRICING, planTotal, type BillingInterval, type BillingStatus } from '@replypilot/shared';
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

// What the plan is now, in a sentence or two.
function PlanSummary({ billing }: { billing: BillingStatus }) {
  const { plan, state } = billing;
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
    return (
      <Typography>
        Free trial: {plural(left, 'day')} left, until {day(billing.trialEndsAt)}. Choose a plan any
        time; nothing is charged until the trial ends.
      </Typography>
    );
  }
  return (
    <Alert severity="warning">
      This workspace has no active plan, so replies can&apos;t be drafted or posted. Your reviews,
      replies and settings are all still here. Choose a plan to carry on.
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
  const { data: billing, isLoading } = useBilling();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Back from Stripe's checkout: read the result now rather than waiting for Stripe's webhook.
  const sessionId = params.get('checkout');
  const confirmed = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || !workspaceId || confirmed.current === sessionId) return;
    confirmed.current = sessionId;
    api
      .post<BillingStatus>(wsPath(workspaceId, '/billing/checkout/confirm'), { sessionId })
      .then((status) => {
        queryClient.setQueryData(['billing', workspaceId], status);
        setDone(true);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setParams({ tab: 'billing' }, { replace: true }));
  }, [sessionId, workspaceId, queryClient, setParams]);

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

  if (isLoading || !billing || sessionId) {
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
            {live && (
              <>
                <Button variant="contained" disabled={busy} onClick={() => go('/billing/portal')}>
                  Manage billing
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Change the card, switch between monthly and yearly, download invoices or cancel,
                  on Stripe&apos;s secure page.
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
