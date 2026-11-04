import type { EmailMessage } from './types';

interface TemplateInput {
  to: string;
  subject: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  outro?: string;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One plain layout for every email, always with a text version.
export function renderEmail({ to, subject, intro, actionLabel, actionUrl, outro }: TemplateInput): EmailMessage {
  const text = [intro, actionUrl && actionLabel ? `${actionLabel}: ${actionUrl}` : '', outro ?? '']
    .filter(Boolean)
    .join('\n\n');
  const button =
    actionUrl && actionLabel
      ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 18px;background:#1f5eff;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(actionLabel)}</a></p>`
      : '';
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:520px"><p>${escapeHtml(intro)}</p>${button}${outro ? `<p style="color:#666">${escapeHtml(outro)}</p>` : ''}</div>`;
  return { to, subject, text, html };
}
