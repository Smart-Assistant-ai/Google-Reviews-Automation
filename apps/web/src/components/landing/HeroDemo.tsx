import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { brand } from '../../theme';
import { demoFrame, demoLength, type DemoPhase } from './demo';
import { blink, bounce, EASE_OUT, fadeUp, noMotion, pop, press, REDUCED_MOTION } from './motion';

type Sample = { name: string; stars: number; review: string; reply: string };

// Made-up reviews, one of them not in English and one less than happy, to show what ReplyPilot
// handles.
const SAMPLES: Sample[] = [
  {
    name: 'Sam P.',
    stars: 5,
    review: 'Quick service and friendly staff. Will be back.',
    reply:
      "Thank you so much, Sam! We're glad the team looked after you, and we look forward to seeing you again soon.",
  },
  {
    name: 'Lucía M.',
    stars: 5,
    review: 'Muy buena atención y todo muy limpio. ¡Volveremos!',
    reply:
      '¡Muchas gracias, Lucía! Nos alegra que todo fuera de su agrado. ¡Esperamos verla pronto!',
  },
  {
    name: 'Chris D.',
    stars: 3,
    review: 'Good overall, but we had a long wait.',
    reply:
      "Thank you for the honest feedback, Chris. We're sorry about the wait and are working to make it shorter. We hope to see you again.",
  },
];

// The list is never empty and the index always wraps, so there is always a sample.
const sampleAt = (i: number) => SAMPLES[i % SAMPLES.length] as Sample;

const still = { [noMotion]: { animation: 'none' } };

// A sample review being answered, playing on a loop: the review arrives, the draft types itself
// out, the owner approves it and it goes live. People who prefer less motion see one finished
// sample. Screen readers get a one-line description instead of the moving text.
export default function HeroDemo() {
  const reduced = useMediaQuery(REDUCED_MOTION, { noSsr: true });
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const sample = sampleAt(index);

  useEffect(() => {
    if (reduced) return;
    const started = performance.now();
    const length = demoLength(sampleAt(index).reply);
    const timer = window.setInterval(() => {
      const now = performance.now() - started;
      if (now < length) {
        setElapsed(now);
      } else {
        setElapsed(0);
        setIndex((i) => (i + 1) % SAMPLES.length);
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [index, reduced]);

  const { phase, typed } = reduced
    ? { phase: 'live' as const, typed: sample.reply.length }
    : demoFrame(elapsed, sample.reply);

  return (
    <Card
      role="img"
      aria-label="Example of a customer review and the reply ReplyPilot drafted for it"
      sx={(theme) => ({
        borderRadius: '20px',
        boxShadow:
          theme.palette.mode === 'dark'
            ? '0 24px 60px rgba(0,0,0,0.45)'
            : `0 24px 60px ${alpha(brand.main, 0.14)}`,
      })}
    >
      <CardContent aria-hidden sx={{ p: 3, '&:last-child': { pb: 2.5 } }}>
        {/* Every sample sits in the same cell, the others invisible, so the card is always as tall
            as the longest one and the hero beside it never jumps. */}
        <Box sx={{ display: 'grid' }}>
          {SAMPLES.map((other, i) =>
            i === index ? (
              <Box
                key={`${i}-shown`}
                sx={{ gridArea: '1 / 1', animation: `${fadeUp} 500ms ${EASE_OUT}`, ...still }}
              >
                <SampleBody sample={sample} phase={phase} typed={typed} />
              </Box>
            ) : (
              <Box key={i} sx={{ gridArea: '1 / 1', visibility: 'hidden' }}>
                <SampleBody sample={other} phase="live" typed={other.reply.length} />
              </Box>
            ),
          )}
        </Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mt: 2, minHeight: 32 }}
        >
          <Status key={`${index}-${phase}`} phase={phase} />
          <Stack direction="row" spacing={0.75}>
            {SAMPLES.map((other, i) => (
              <Box
                key={other.name}
                sx={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  borderRadius: '3px',
                  bgcolor: i === index ? 'primary.main' : 'action.disabled',
                  transition: 'width 300ms ease, background-color 300ms ease',
                }}
              />
            ))}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SampleBody({ sample, phase, typed }: { sample: Sample; phase: DemoPhase; typed: number }) {
  return (
    <>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          sx={(theme) => ({
            width: 38,
            height: 38,
            fontSize: 16,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.primary.main, 0.14),
            color: 'primary.main',
          })}
        >
          {sample.name[0]}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2">{sample.name}</Typography>
          <Stack direction="row">
            {[1, 2, 3, 4, 5].map((star) => (
              <StarRoundedIcon
                key={star}
                sx={{
                  fontSize: 18,
                  color: star <= sample.stars ? brand.star : 'action.disabled',
                  animation: `${pop} 400ms ${EASE_OUT} ${star * 90}ms both`,
                  ...still,
                }}
              />
            ))}
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Just now
        </Typography>
      </Stack>
      <Typography sx={{ mt: 1.5 }}>&ldquo;{sample.review}&rdquo;</Typography>

      <Box
        sx={(theme) => ({
          mt: 2,
          p: 2,
          borderRadius: '14px',
          border: 1,
          borderColor: alpha(theme.palette.primary.main, 0.25),
          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.1 : 0.05),
        })}
      >
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'primary.main' }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {phase === 'review'
              ? 'Reading the review'
              : phase === 'drafting'
                ? 'Drafting'
                : 'AI draft'}
          </Typography>
          {phase === 'drafting' && (
            <Stack direction="row" spacing={0.4}>
              {[0, 1, 2].map((dot) => (
                <Box
                  key={dot}
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: 'currentColor',
                    animation: `${bounce} 1s ease-in-out ${dot * 150}ms infinite`,
                  }}
                />
              ))}
            </Stack>
          )}
        </Stack>
        {/* The whole reply, invisible underneath, holds the box at its final height while the
            draft types itself out on top. */}
        <Box sx={{ display: 'grid', mt: 0.75 }}>
          <Typography variant="body2" sx={{ gridArea: '1 / 1', visibility: 'hidden' }}>
            {sample.reply}
          </Typography>
          {phase === 'drafting' ? (
            // Same text size as the reply, so two placeholder lines are never taller than it.
            <Typography variant="body2" component="div" sx={{ gridArea: '1 / 1' }}>
              <Skeleton animation="wave" width="100%" />
              <Skeleton animation="wave" width="85%" />
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ gridArea: '1 / 1' }}>
              {sample.reply.slice(0, typed)}
              {phase === 'typing' && (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: '2px',
                    height: '1em',
                    ml: '1px',
                    verticalAlign: 'text-bottom',
                    bgcolor: 'primary.main',
                    animation: `${blink} 1s steps(1) infinite`,
                  }}
                />
              )}
            </Typography>
          )}
        </Box>
      </Box>
    </>
  );
}

function Status({ phase }: { phase: DemoPhase }) {
  if (phase === 'approving') {
    // Looks like the app's button, but it's part of the picture, so it isn't one.
    return (
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          borderRadius: '8px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontSize: 13,
          fontWeight: 600,
          animation: `${fadeUp} 250ms ${EASE_OUT} both, ${press} 1100ms ease`,
          ...still,
        }}
      >
        Approve and post
      </Box>
    );
  }
  if (phase === 'live') {
    return (
      <Chip
        size="small"
        color="success"
        icon={<CheckCircleRoundedIcon />}
        label="Live on Google"
        sx={{ animation: `${pop} 450ms ${EASE_OUT} both`, ...still }}
      />
    );
  }
  const label =
    phase === 'review' ? 'New review' : phase === 'drafting' ? 'Drafting…' : 'Draft ready';
  return (
    <Chip
      size="small"
      variant="outlined"
      color={phase === 'typing' ? 'primary' : 'default'}
      label={label}
    />
  );
}
