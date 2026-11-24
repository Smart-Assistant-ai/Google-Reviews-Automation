import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { brand } from '../../theme';
import { drift, noMotion } from './motion';

const BLOBS = [
  // Brand green, top right, reaching up behind the header.
  { color: brand.main, size: 560, at: { top: -220, right: -140 }, seconds: 18, delay: 0 },
  // A touch of star amber on the left.
  { color: brand.star, size: 380, at: { top: 140, left: -160 }, seconds: 22, delay: -7 },
  { color: brand.light, size: 320, at: { bottom: -60, right: '30%' }, seconds: 20, delay: -12 },
];

// Soft colour that drifts behind the hero, over a faint grid that fades out from the top.
// Purely decoration, so screen readers skip it and clicks go through it.
export default function HeroGlow() {
  return (
    <Box aria-hidden sx={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Box
        sx={(theme) => {
          const line = alpha(
            theme.palette.text.primary,
            theme.palette.mode === 'dark' ? 0.06 : 0.05,
          );
          const fade = 'radial-gradient(ellipse 70% 65% at 50% 0%, #000 25%, transparent 75%)';
          return {
            position: 'absolute',
            inset: '-120px 0 0 0',
            backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
            backgroundSize: '44px 44px',
            maskImage: fade,
            WebkitMaskImage: fade,
          };
        }}
      />
      {BLOBS.map((blob) => (
        <Box
          key={blob.color}
          sx={(theme) => ({
            position: 'absolute',
            ...blob.at,
            width: blob.size,
            height: blob.size,
            borderRadius: '50%',
            bgcolor: blob.color,
            opacity: theme.palette.mode === 'dark' ? 0.24 : 0.22,
            filter: 'blur(90px)',
            willChange: 'transform',
            animation: `${drift} ${blob.seconds}s ease-in-out ${blob.delay}s infinite alternate`,
            [noMotion]: { animation: 'none' },
          })}
        />
      ))}
    </Box>
  );
}
