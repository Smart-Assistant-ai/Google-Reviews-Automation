import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { Box, Container, Stack, Typography } from '@mui/material';
import { brand } from '../../theme';
import Reveal from './Reveal';
import SignUpButton from './SignUpButton';
import { drift, noMotion } from './motion';

// The last thing on the home page: one more invitation to sign up, on a green panel with a warm
// glow drifting in one corner and soft rings in the other.
export default function ClosingCta() {
  return (
    <Container maxWidth="lg" sx={{ pb: { xs: 7, md: 10 } }}>
      <Reveal>
        <Box
          component="section"
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '24px',
            px: { xs: 3, md: 8 },
            py: { xs: 6, md: 8 },
            textAlign: 'center',
            color: '#fff',
            background: `linear-gradient(135deg, ${brand.dark} 0%, ${brand.main} 55%, #17A589 100%)`,
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              width: 360,
              height: 360,
              top: -170,
              right: -90,
              borderRadius: '50%',
              bgcolor: brand.star,
              opacity: 0.3,
              filter: 'blur(70px)',
              animation: `${drift} 16s ease-in-out infinite alternate`,
              [noMotion]: { animation: 'none' },
            }}
          />
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              width: 380,
              height: 380,
              bottom: -250,
              left: -110,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 0 0 56px rgba(255,255,255,0.05), 0 0 0 112px rgba(255,255,255,0.03)',
            }}
          />
          <Box sx={{ position: 'relative' }}>
            <Stack direction="row" justifyContent="center" aria-hidden>
              {[1, 2, 3, 4, 5].map((star) => (
                <StarRoundedIcon key={star} sx={{ color: brand.star, fontSize: 26 }} />
              ))}
            </Stack>
            <Typography
              variant="h4"
              component="h2"
              sx={{ mt: 2, fontSize: { xs: '1.75rem', md: '2.5rem' }, textWrap: 'balance' }}
            >
              Ready to answer every review?
            </Typography>
            <Typography sx={{ mt: 1.5, mx: 'auto', maxWidth: 560, opacity: 0.88 }}>
              Connect your Google Business Profile and ReplyPilot drafts a reply to each new review.
              Nothing is posted until you approve it.
            </Typography>
            <Box sx={{ mt: 4 }}>
              <SignUpButton light />
            </Box>
          </Box>
        </Box>
      </Reveal>
    </Container>
  );
}
