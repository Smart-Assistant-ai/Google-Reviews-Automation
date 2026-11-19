import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import { Box, Button, Card, CardContent, Container, Grid, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import Stars from '../components/Stars';

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

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
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
  },
];

export default function Landing() {
  return (
    <PublicLayout>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Grid container spacing={6} alignItems="center">
          <Grid item xs={12} md={7}>
            <Typography
              variant="h3"
              component="h1"
              sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}
            >
              Answer every Google review, in minutes
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ mt: 2, fontWeight: 400 }}>
              ReplyPilot brings the reviews from your Google Business Profile into one inbox and
              drafts a reply to each one with AI. You check the draft and post it to Google. Nothing
              is posted without your approval.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
              <Button variant="contained" size="large" component={RouterLink} to="/signup">
                Create an account
              </Button>
              <Button variant="outlined" size="large" component={RouterLink} to="/login">
                Log in
              </Button>
            </Stack>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card sx={{ boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}>
              <CardContent sx={{ p: 3 }}>
                <Stars value={5} />
                <Typography sx={{ mt: 1 }}>
                  &ldquo;Quick service and friendly staff. Will be back.&rdquo;
                </Typography>
                <Box
                  sx={{
                    mt: 2,
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    borderLeft: 3,
                    borderColor: 'primary.main',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Draft reply
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Thank you so much! We&apos;re glad the team looked after you, and we look
                    forward to seeing you again soon.
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ bgcolor: 'action.hover', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h4" component="h2">
            How it works
          </Typography>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            {STEPS.map((step, i) => (
              <Grid item xs={12} md={4} key={step.title}>
                <Typography variant="overline" color="primary">
                  Step {i + 1}
                </Typography>
                <Typography variant="h6" component="h3">
                  {step.title}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {step.body}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 } }}>
        <Grid container spacing={3}>
          {FEATURES.map((feature) => (
            <Grid item xs={12} sm={6} md={3} key={feature.title}>
              {feature.icon}
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 1 }}>
                {feature.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {feature.body}
              </Typography>
            </Grid>
          ))}
        </Grid>
      </Container>
    </PublicLayout>
  );
}
