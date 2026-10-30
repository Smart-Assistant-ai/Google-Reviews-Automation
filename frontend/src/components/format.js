export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function countdown(date) {
  const s = Math.max(0, Math.floor((new Date(date).getTime() - Date.now()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const byteLength = (text) => new TextEncoder().encode(text || '').length;

export const LANGUAGE_NAMES = { en: 'English', hi: 'Hindi', mr: 'Marathi', es: 'Spanish' };
