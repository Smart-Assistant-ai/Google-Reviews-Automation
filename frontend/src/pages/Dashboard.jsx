import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, CircularProgress, Grid, Stack, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { chartColors } from '../theme/chartColors';
import { brand } from '../theme';
import api from '../api/client';

const RANGES = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '12m' },
];

const weekLabel = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Kpi({ label, value, suffix, delta, hint }) {
  const up = delta > 0;
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mt: 1 }}>
          <Typography variant="h4">{value ?? '—'}</Typography>
          {suffix && value !== null && <Typography color="text.secondary">{suffix}</Typography>}
        </Stack>
        {delta !== undefined && delta !== null && delta !== 0 ? (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
            {up ? <TrendingUpRoundedIcon fontSize="small" color="success" /> : <TrendingDownRoundedIcon fontSize="small" color="error" />}
            <Typography variant="caption" color={up ? 'success.main' : 'error.main'}>
              {up ? '+' : ''}{delta} vs previous period
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>{hint || ' '}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, subtitle, legend, children, height = 260 }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="subtitle2">{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {legend}
        </Stack>
        <Box sx={{ height }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function Legend({ items }) {
  return (
    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Stack key={i.label} direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: i.color }} />
          <Typography variant="caption" color="text.secondary">{i.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function ChartTooltip({ active, payload, label, formatLabel }) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1.25, boxShadow: theme.shadows[3] }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }} component="div">{formatLabel ? formatLabel(label) : label}</Typography>
      {payload.map((p) => (
        <Stack key={p.dataKey} direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: p.color || p.fill }} />
          <Typography variant="caption" color="text.secondary">{p.name}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, ml: 'auto', pl: 2 }}>{p.value}</Typography>
        </Stack>
      ))}
    </Box>
  );
}

export default function Dashboard() {
  const theme = useTheme();
  const c = chartColors(theme.palette.mode);
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get('/stats', { params: { days } }).then(setData);
  }, [days]);

  const axis = { fontSize: 12, fill: theme.palette.text.secondary };
  const weekly = (data?.weekly || []).map((w) => ({
    ...w, negative: w[1] + w[2], neutral: w[3], positive: w[4] + w[5],
  }));
  const topics = (data?.topics || []).map((t) => ({ ...t, complained: -t.negative, praised: t.positive }));
  const maxStar = Math.max(1, ...(data?.starDistribution || []).map((s) => s.count));

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5">Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">How guests feel, and how fast you respond.</Typography>
        </Box>
        <ToggleButtonGroup size="small" exclusive value={days} onChange={(_, v) => v && setDays(v)}>
          {RANGES.map((r) => <ToggleButton key={r.value} value={r.value} sx={{ px: 2 }}>{r.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>

      {!data ? (
        <Box sx={{ p: 8, textAlign: 'center' }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={6} md={3}><Kpi label="Average rating" value={data.kpis.avgRating} suffix="/ 5" delta={data.kpis.avgRatingDelta} /></Grid>
          <Grid item xs={6} md={3}>
            <Kpi label="New reviews" value={data.kpis.totalReviews} delta={data.kpis.totalReviews - data.kpis.previousTotal || null} />
          </Grid>
          <Grid item xs={6} md={3}><Kpi label="Response rate" value={data.kpis.responseRate} suffix="%" hint={`${data.kpis.awaitingReply} awaiting reply`} /></Grid>
          <Grid item xs={6} md={3}>
            <Kpi label="Avg. response time" value={data.kpis.avgResponseHours} suffix="hrs" hint="From review to reply posted" />
          </Grid>

          <Grid item xs={12} md={7}>
            <ChartCard title="Average rating by week" subtitle="1–5 stars">
              <ResponsiveContainer>
                <LineChart data={weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="week" tickFormatter={weekLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatLabel={(l) => `Week of ${weekLabel(l)}`} />} cursor={{ stroke: theme.palette.text.secondary, strokeDasharray: '3 3' }} />
                  <Line animationDuration={500} type="monotone" dataKey="avgRating" name="Avg rating" stroke={c.line} strokeWidth={2}
                    dot={{ r: 4, fill: c.line, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 6, stroke: c.surface, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={5}>
            <ChartCard title="Rating breakdown" subtitle={`${data.kpis.totalReviews} reviews`}>
              <Stack spacing={1.75} sx={{ pt: 1 }}>
                {data.starDistribution.map((s) => (
                  <Stack key={s.stars} direction="row" spacing={1.5} alignItems="center">
                    <Typography variant="body2" sx={{ width: 28 }}>{s.stars}★</Typography>
                    <Box sx={{ flex: 1, height: 14, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
                      <Box sx={{ width: `${(s.count / maxStar) * 100}%`, height: '100%', bgcolor: brand.star, borderRadius: 1, transition: 'width .4s' }} />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ width: 28, textAlign: 'right' }}>{s.count}</Typography>
                  </Stack>
                ))}
              </Stack>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={7}>
            <ChartCard
              title="Reviews per week"
              legend={<Legend items={[{ label: '4–5★', color: c.positive }, { label: '3★', color: c.neutral }, { label: '1–2★', color: c.negative }]} />}
            >
              <ResponsiveContainer>
                <BarChart data={weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="week" tickFormatter={weekLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip formatLabel={(l) => `Week of ${weekLabel(l)}`} />} cursor={{ fill: theme.palette.action.hover }} />
                  <Bar animationDuration={500} dataKey="negative" name="1–2★" stackId="s" fill={c.negative} stroke={c.surface} strokeWidth={2} />
                  <Bar animationDuration={500} dataKey="neutral" name="3★" stackId="s" fill={c.neutral} stroke={c.surface} strokeWidth={2} />
                  <Bar animationDuration={500} dataKey="positive" name="4–5★" stackId="s" fill={c.positive} stroke={c.surface} strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={5}>
            <ChartCard
              title="What guests talk about"
              subtitle="Mentions in negative vs positive reviews"
              legend={<Legend items={[{ label: 'Complained', color: c.negative }, { label: 'Praised', color: c.positive }]} />}
            >
              {topics.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Topics appear once reviews are analysed.</Typography>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={topics} layout="vertical" stackOffset="sign" margin={{ top: 0, right: 8, left: 8, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid stroke={c.grid} horizontal={false} />
                    <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => Math.abs(v)} />
                    <YAxis type="category" dataKey="topic" tick={axis} axisLine={false} tickLine={false} width={100} />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <ChartTooltip active={active} label={label}
                          payload={payload?.map((p) => ({ ...p, value: Math.abs(p.value) }))} />
                      )}
                      cursor={{ fill: theme.palette.action.hover }}
                    />
                    <Bar animationDuration={500} dataKey="complained" name="Complained" stackId="t" fill={c.negative} radius={[4, 0, 0, 4]} />
                    <Bar animationDuration={500} dataKey="praised" name="Praised" stackId="t" fill={c.positive} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
