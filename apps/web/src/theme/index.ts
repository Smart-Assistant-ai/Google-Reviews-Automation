import { createTheme, alpha } from '@mui/material/styles';

// Brand: calm emerald accent + warm amber stars on soft neutrals. Deliberately not Google's palette.
export const brand = { main: '#0F8B6F', light: '#3FB89A', dark: '#0A6650', star: '#F5A524' };

export function buildTheme(mode) {
  const dark = mode === 'dark';
  return createTheme({
    palette: {
      mode,
      primary: { main: dark ? brand.light : brand.main, contrastText: '#fff' },
      secondary: { main: brand.star },
      background: dark ? { default: '#0E1014', paper: '#161920' } : { default: '#F6F6F3', paper: '#FFFFFF' },
      text: dark ? { primary: '#ECEDEF', secondary: '#9BA1AC' } : { primary: '#16181D', secondary: '#5F6573' },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(22,24,29,0.08)',
      success: { main: '#1E9E5A' },
      warning: { main: '#D98A00' },
      error: { main: '#D64545' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.02em' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em' },
      h6: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: ({ theme }) => ({ borderColor: theme.palette.divider }) },
      },
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 8,
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.primary.main, dark ? 0.18 : 0.1),
              color: theme.palette.primary.main,
              '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
            },
          }),
        },
      },
    },
  });
}
