import { keyframes } from '@emotion/react';

// The home page moves a little so it feels alive. Anyone who has asked their device for less
// motion sees every effect in its finished state instead.
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
export const noMotion = `@media ${REDUCED_MOTION}`;

export const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
`;

// Plays once as the page opens. `delay` staggers the parts of the hero so they arrive in order.
export const enter = (delay = 0) => ({
  animation: `${fadeUp} 700ms ${EASE_OUT} ${delay}ms both`,
  [noMotion]: { animation: 'none' },
});

// A slow wander for the glow behind the hero.
export const drift = keyframes`
  0% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(40px, 24px, 0) scale(1.08); }
  100% { transform: translate3d(-24px, 12px, 0) scale(0.95); }
`;
