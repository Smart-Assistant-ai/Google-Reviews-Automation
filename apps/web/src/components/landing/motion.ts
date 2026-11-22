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

// Slides a gradient along, for the coloured words in the headline.
export const shimmer = keyframes`
  to { background-position: 200% center; }
`;

// A ring that grows and fades from a dot, like a live indicator.
export const ping = keyframes`
  75%, 100% { transform: scale(2.6); opacity: 0; }
`;

// Grows past full size and settles, for stars and the status that appear in the sample review.
export const pop = keyframes`
  0% { opacity: 0; transform: scale(0.4); }
  70% { opacity: 1; transform: scale(1.15); }
  100% { opacity: 1; transform: scale(1); }
`;

// The typing cursor.
export const blink = keyframes`
  50% { opacity: 0; }
`;

// The three dots of "drafting".
export const bounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-3px); opacity: 1; }
`;

// A button being pressed, near the end of the time it is shown.
export const press = keyframes`
  0%, 60% { transform: scale(1); }
  72% { transform: scale(0.93); }
  84%, 100% { transform: scale(1); }
`;
