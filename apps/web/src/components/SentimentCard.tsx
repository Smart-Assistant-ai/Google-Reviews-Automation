import type { Stats } from '@replypilot/shared';
import { Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { chartColors } from '../theme/chartColors';

const INK_DARK = '#16181D';

// Relative luminance, to print each share in whichever of white or near-black reads better on it.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const inkOn = (fill: string) => {
  const l = luminance(fill);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (luminance(INK_DARK) + 0.05) ? '#fff' : INK_DARK;
};

// A share narrower than this can't fit its label, so the legend carries it instead.
const MIN_LABELLED = 0.08;

// One whole split into negative, neutral and positive, in that order like the scale it is.
export default function SentimentCard({ sentiment }: { sentiment: Stats['sentiment'] }) {
  const theme = useTheme();
  const c = chartColors(theme.palette.mode);
  const total = sentiment.negative + sentiment.neutral + sentiment.positive;
  const parts = [
    { key: 'negative', label: 'Negative', count: sentiment.negative, color: c.negative },
    { key: 'neutral', label: 'Neutral', count: sentiment.neutral, color: c.neutral },
    { key: 'positive', label: 'Positive', count: sentiment.positive, color: c.positive },
  ].map((p) => ({ ...p, share: total ? p.count / total : 0 }));
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const summary = parts.map((p) => `${p.count} ${p.key} (${pct(p.share)})`).join(', ');

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="subtitle2">How reviews feel</Typography>
            <Typography variant="caption" color="text.secondary">
              {total
                ? `Sentiment of ${total} analysed review${total === 1 ? '' : 's'}`
                : 'Sentiment of written reviews'}
            </Typography>
          </Box>
          {total > 0 && (
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              {parts.map((p) => (
                <Stack key={p.key} direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: p.color }} />
                  <Typography variant="caption" color="text.secondary">
                    {p.label}
                    {p.count > 0 && p.share < MIN_LABELLED ? ` ${pct(p.share)}` : ''}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
        {total === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Sentiment appears once reviews with text are analysed.
          </Typography>
        ) : (
          <Box
            role="img"
            aria-label={`Sentiment: ${summary}`}
            sx={{ display: 'flex', gap: '2px', height: 28 }}
          >
            {parts
              .filter((p) => p.count > 0)
              .map((p) => (
                <Tooltip
                  key={p.key}
                  title={`${p.label}: ${p.count} review${p.count === 1 ? '' : 's'} (${pct(p.share)})`}
                  arrow
                >
                  <Box
                    tabIndex={0}
                    aria-label={`${p.label}: ${p.count} (${pct(p.share)})`}
                    sx={{
                      flexGrow: p.count,
                      flexBasis: 0,
                      minWidth: 4,
                      bgcolor: p.color,
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      // Padding lives on the label, so a block's width stays exactly its share.
                      overflow: 'hidden',
                      outlineOffset: 2,
                      '&:focus-visible': { outline: 2, outlineColor: 'text.primary' },
                    }}
                  >
                    {p.share >= MIN_LABELLED && (
                      <Typography
                        variant="caption"
                        sx={{ px: 1, fontWeight: 600, color: inkOn(p.color), whiteSpace: 'nowrap' }}
                      >
                        {pct(p.share)}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
