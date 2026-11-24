import { Box, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EASE_OUT, noMotion, REDUCED_MOTION } from './motion';

// True once the element has scrolled into view, and from the start for people who prefer less
// motion or browsers that can't tell. It never goes back, so nothing fades out again.
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const reduced = useMediaQuery(REDUCED_MOTION, { noSsr: true });
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const node = ref.current;
    if (seen || reduced || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      // Wait until it is a little way onto the screen, so the fade is seen rather than missed.
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, reduced]);
  return [ref, seen || reduced] as const;
}

// Fades its content up into place the first time it scrolls into view. `delay` staggers items
// that arrive together.
export default function Reveal({
  children,
  delay = 0,
  sx,
}: {
  children: ReactNode;
  delay?: number;
  sx?: SxProps<Theme>;
}) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <Box
      ref={ref}
      sx={[
        {
          opacity: shown ? 1 : 0,
          // 'none' rather than translateY(0), so a revealed section doesn't trap fixed elements.
          transform: shown ? 'none' : 'translateY(24px)',
          transition: `opacity 700ms ${EASE_OUT} ${delay}ms, transform 700ms ${EASE_OUT} ${delay}ms`,
          [noMotion]: { transition: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
