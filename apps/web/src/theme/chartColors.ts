// Diverging palette for rating polarity (validated with the dataviz CVD/contrast checker
// against each surface). Neutral midpoint is gray, never a hue.
export function chartColors(mode: 'light' | 'dark') {
  return mode === 'dark'
    ? { positive: '#5288EA', negative: '#E25D52', neutral: '#4A4A46', line: '#3FB89A', grid: 'rgba(255,255,255,0.06)', surface: '#161920' }
    : { positive: '#2F6FDB', negative: '#D0453A', neutral: '#D6D5D0', line: '#0F8B6F', grid: 'rgba(22,24,29,0.06)', surface: '#FFFFFF' };
}
