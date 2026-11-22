import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import RecordVoiceOverRoundedIcon from '@mui/icons-material/RecordVoiceOverRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuthConfig } from '../api/hooks';
import { brand } from '../theme';
import PublicLayout from '../components/PublicLayout';
import FloatingNote from '../components/landing/FloatingNote';
import HeroDemo from '../components/landing/HeroDemo';
import HeroGlow from '../components/landing/HeroGlow';
import Reveal from '../components/landing/Reveal';
import SectionHeading from '../components/landing/SectionHeading';
import Steps from '../components/landing/Steps';
import { enter, noMotion, ping, shimmer } from '../components/landing/motion';

// The public home page. Google's verification reads it to learn what the app does, so it says
// plainly what ReplyPilot does with a connected Business Profile and links the privacy policy.
const STEPS = [
  {
    title: 'Connect your Business Profile',
    body: 'Sign in with the Google account that owns or manages your profile, then choose which locations ReplyPilot looks after.',
  },
  {
    title: 'Get a draft for every review',
    body: "Each new review gets a reply drafted by AI in your business's voice and in the reviewer's language. Make it shorter, warmer or more formal with one click.",
  },
  {
    title: 'Approve and post',
    body: 'Edit the draft if you like, then post it to Google. ReplyPilot shows when Google publishes it, or why Google turned it down.',
  },
];

// Promises the rest of the page backs up, repeated under the hero buttons.
const PROMISES = [
  'You approve every reply',
  "Replies in the reviewer's language",
  'Disconnect any time',
];

const FEATURES: { icon: ReactNode; title: string; body: string; needsEmail?: boolean }[] = [
  {
    icon: <InboxRoundedIcon color="primary" />,
    title: 'One inbox for every location',
    body: 'Every review in one place, filtered by what still needs a reply.',
  },
  {
    icon: <AutoAwesomeRoundedIcon color="primary" />,
    title: 'Drafts you control',
    body: 'Set your tone and sign-off once. Nothing is posted until you approve it.',
  },
  {
    icon: <InsightsRoundedIcon color="primary" />,
    title: 'See how you are rated',
    body: 'Average rating over time, weekly review volume and the topics customers mention.',
  },
  {
    icon: <GroupsRoundedIcon color="primary" />,
    title: 'Work as a team',
    body: 'Invite colleagues, and choose which locations each person looks after.',
    // Invitations go out by email.
    needsEmail: true,
  },
];

export default function Landing() {
  const emails = useAuthConfig().data?.emails === true;
  const features = FEATURES.filter((feature) => emails || !feature.needsEmail);
  return (
    <PublicLayout>
      {/* The glow may spill up behind the header, but is cut off at the sides and the bottom so it
          never makes the page scroll sideways or tints the next section. */}
      <Box
        component="section"
        sx={{ position: 'relative', overflowX: 'clip', clipPath: 'inset(-240px 0 0 0)' }}
      >
        <HeroGlow />
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, py: { xs: 6, md: 10 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Box
                sx={(theme) => ({
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 1.25,
                  mb: 2.5,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 999,
                  border: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                  typography: 'body2',
                  fontWeight: 600,
                  ...enter(),
                })}
              >
                <Box
                  aria-hidden
                  sx={{
                    position: 'relative',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'currentColor',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      bgcolor: 'currentColor',
                      animation: `${ping} 2s cubic-bezier(0, 0, 0.2, 1) infinite`,
                    },
                    [noMotion]: { '&::after': { animation: 'none', opacity: 0 } },
                  }}
                />
                AI reply drafts for Google reviews
              </Box>
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '2.4rem', sm: '3rem', md: '3.6rem' },
                  lineHeight: 1.08,
                  letterSpacing: '-0.03em',
                  ...enter(80),
                }}
              >
                Answer{' '}
                <Box
                  component="span"
                  sx={(theme) => {
                    // Greens only: amber would be too faint against the light background.
                    const stops =
                      theme.palette.mode === 'dark'
                        ? [brand.light, '#9BE7D2', brand.light]
                        : [brand.dark, brand.main, '#1BA98C', brand.main, brand.dark];
                    return {
                      backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})`,
                      backgroundSize: '200% auto',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      color: 'transparent',
                      WebkitTextFillColor: 'transparent',
                      animation: `${shimmer} 8s linear infinite`,
                      [noMotion]: { animation: 'none' },
                    };
                  }}
                >
                  every Google review
                </Box>
                , in minutes
              </Typography>
              <Typography
                variant="h6"
                color="text.secondary"
                sx={{ mt: 2, fontWeight: 400, ...enter(160) }}
              >
                ReplyPilot brings the reviews from your Google Business Profile into one inbox and
                drafts a reply to each one with AI. You check the draft and post it to Google.
                Nothing is posted without your approval.
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ mt: 4, ...enter(240) }}
              >
                <Button variant="contained" size="large" component={RouterLink} to="/signup">
                  Create an account
                </Button>
                <Button variant="outlined" size="large" component={RouterLink} to="/login">
                  Log in
                </Button>
              </Stack>
              <Stack
                component="ul"
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 1, sm: 2.5 }}
                useFlexGap
                flexWrap="wrap"
                sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, ...enter(320) }}
              >
                {PROMISES.map((promise) => (
                  <Stack
                    component="li"
                    key={promise}
                    direction="row"
                    spacing={0.75}
                    alignItems="center"
                  >
                    <CheckRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                    <Typography variant="body2" color="text.secondary">
                      {promise}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Box sx={{ position: 'relative', ...enter(300) }}>
                {/* A second card peeking out behind, so the sample reads as one of many. */}
                <Box
                  aria-hidden
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '20px',
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    opacity: 0.6,
                    transform: 'rotate(4deg) translate(14px, 10px)',
                  }}
                />
                <Box sx={{ position: 'relative' }}>
                  <HeroDemo />
                </Box>
                <FloatingNote icon={<RecordVoiceOverRoundedIcon />} sx={{ top: -24, left: -36 }}>
                  Written in your voice
                </FloatingNote>
                <FloatingNote
                  icon={<StorefrontRoundedIcon />}
                  delay={-3}
                  sx={{ bottom: -26, right: -16 }}
                >
                  One inbox for every location
                </FloatingNote>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box
        id="how-it-works"
        component="section"
        sx={(theme) => ({
          py: { xs: 7, md: 10 },
          borderBlock: 1,
          borderColor: 'divider',
          background: `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.02)}, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.08 : 0.06)})`,
        })}
      >
        <Container maxWidth="lg">
          <Reveal>
            <SectionHeading
              eyebrow="How it works"
              title="From new review to posted reply in three steps"
            />
          </Reveal>
          <Steps steps={STEPS} />
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
        <Grid container spacing={3}>
          {features.map((feature, i) => (
            <Grid item xs={12} sm={6} md={12 / features.length} key={feature.title}>
              <Reveal delay={i * 100}>
                {feature.icon}
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 1 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {feature.body}
                </Typography>
              </Reveal>
            </Grid>
          ))}
        </Grid>

        <Reveal sx={{ mt: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <LockRoundedIcon color="primary" />
                <Typography variant="h6" component="h2">
                  What ReplyPilot does with your Google data
                </Typography>
              </Stack>
              <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                When you connect, Google asks you to let ReplyPilot manage your Business Profile. We
                use that permission only to list the profiles and locations you manage, read their
                reviews, and post, edit or delete the replies you approve. We don&apos;t sell your
                data, use it for advertising, or use it to train AI models. You can disconnect at
                any time in Settings or from your Google Account.
              </Typography>
              <Link component={RouterLink} to="/privacy" sx={{ display: 'inline-block', mt: 1.5 }}>
                Read our privacy policy
              </Link>
            </CardContent>
          </Card>
        </Reveal>
      </Container>
    </PublicLayout>
  );
}
