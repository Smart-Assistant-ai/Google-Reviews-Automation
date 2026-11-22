import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { brand } from '../../theme';
import { EASE_OUT, noMotion } from './motion';
import { useReveal } from './Reveal';

const CIRCLE = 56;
const GAP = 4;

// Numbered steps side by side on wide screens, joined by a line that draws itself from the first
// number to the last as the steps come into view. On a phone they stack, without the line.
export default function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  const [ref, shown] = useReveal<HTMLOListElement>();
  const count = steps.length;
  return (
    <Box
      ref={ref}
      component="ol"
      sx={{
        position: 'relative',
        listStyle: 'none',
        p: 0,
        m: 0,
        mt: { xs: 5, md: 7 },
        display: 'grid',
        gap: { xs: 5, md: GAP },
        gridTemplateColumns: { xs: '1fr', md: `repeat(${count}, 1fr)` },
      }}
    >
      <Box
        aria-hidden
        sx={(theme) => {
          // From the middle of the first column to the middle of the last.
          const inset = `calc((100% - ${count - 1} * ${theme.spacing(GAP)}) / ${count * 2})`;
          return {
            display: { xs: 'none', md: 'block' },
            position: 'absolute',
            top: CIRCLE / 2 - 1,
            left: inset,
            right: inset,
            height: 2,
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.2)})`,
            transformOrigin: 'left',
            transform: shown ? 'none' : 'scaleX(0)',
            transition: `transform 1200ms ${EASE_OUT} 200ms`,
            [noMotion]: { transition: 'none' },
          };
        }}
      />
      {steps.map((step, i) => (
        <Box
          component="li"
          key={step.title}
          sx={{
            position: 'relative',
            textAlign: 'center',
            opacity: shown ? 1 : 0,
            transform: shown ? 'none' : 'translateY(24px)',
            transition: `opacity 700ms ${EASE_OUT} ${i * 180}ms, transform 700ms ${EASE_OUT} ${i * 180}ms`,
            [noMotion]: { transition: 'none' },
            '&:hover .step-number': { transform: 'scale(1.08)' },
          }}
        >
          <Box
            aria-hidden
            className="step-number"
            sx={{
              mx: 'auto',
              width: CIRCLE,
              height: CIRCLE,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
              background: `linear-gradient(135deg, ${brand.main}, ${brand.light})`,
              boxShadow: `0 10px 24px ${alpha(brand.main, 0.35)}`,
              transition: `transform 250ms ${EASE_OUT}`,
            }}
          >
            {i + 1}
          </Box>
          <Typography variant="h6" component="h3" sx={{ mt: 2.5 }}>
            {step.title}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 340, mx: 'auto' }}>
            {step.body}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
