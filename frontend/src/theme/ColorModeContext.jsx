import { createContext, useContext, useMemo, useState } from 'react';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import { buildTheme } from './index';

const ColorModeContext = createContext({ mode: 'light', toggle: () => {} });

function readStored() {
  try {
    return localStorage.getItem('rp_mode');
  } catch {
    return null;
  }
}

export function ColorModeProvider({ children }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [stored, setStored] = useState(readStored);
  const mode = stored || (prefersDark ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('rp_mode', next);
    } catch {
      // ignore storage failures
    }
    setStored(next);
  };

  return (
    <ColorModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export const useColorMode = () => useContext(ColorModeContext);
