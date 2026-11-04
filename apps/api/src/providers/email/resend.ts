import type { EmailProvider } from './types';

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    async send({ to, subject, text, html }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      if (!res.ok) throw new Error(`Resend refused the email with status ${res.status}`);
    },
  };
}
