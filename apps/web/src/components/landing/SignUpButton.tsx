import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { brand } from '../../theme';
import { EASE_OUT, noMotion } from './motion';

// The home page's main button. A soft glow sits under it, and on hover its arrow nudges forward and
// a shine sweeps across. `light` is the white version for a green background.
export default function SignUpButton({ light = false }: { light?: boolean }) {
  return (
    <Button
      variant="contained"
      size="large"
      component={RouterLink}
      to="/signup"
      endIcon={<ArrowForwardRoundedIcon />}
      sx={(theme) => {
        const glow = light ? 'rgba(0,0,0,0.2)' : alpha(theme.palette.primary.main, 0.35);
        return {
          position: 'relative',
          overflow: 'hidden',
          px: 3,
          boxShadow: `0 10px 28px ${glow}`,
          transition: `transform 200ms ${EASE_OUT}, box-shadow 200ms ease, background-color 200ms ease`,
          ...(light && { bgcolor: '#fff', color: brand.dark }),
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: `0 14px 34px ${glow}`,
            ...(light && { bgcolor: '#F1FAF7' }),
          },
          '& .MuiButton-endIcon': { transition: `transform 200ms ${EASE_OUT}` },
          '&:hover .MuiButton-endIcon': { transform: 'translateX(4px)' },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '-60%',
            width: '40%',
            background: `linear-gradient(100deg, transparent, ${light ? alpha(brand.main, 0.18) : 'rgba(255,255,255,0.35)'}, transparent)`,
            transform: 'skewX(-20deg)',
            transition: 'left 650ms ease',
            pointerEvents: 'none',
          },
          '&:hover::after': { left: '130%' },
          [noMotion]: {
            '&:hover': { transform: 'none' },
            '&:hover .MuiButton-endIcon': { transform: 'none' },
            '&::after': { display: 'none' },
          },
        };
      }}
    >
      Create an account
    </Button>
  );
}
