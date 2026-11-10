import { env } from '../../config';
import { renderEmail } from '../../providers/email/template';

export const verifyEmailMessage = (to: string, token: string) =>
  renderEmail({
    to,
    subject: 'Confirm your email',
    intro: 'Confirm your email to connect your Google Business Profile and post replies.',
    actionLabel: 'Confirm email',
    actionUrl: `${env.APP_URL}/verify-email?token=${token}`,
    outro: 'This link works for 48 hours. If you did not sign up, you can ignore this email.',
  });

export const resetPasswordMessage = (to: string, token: string) =>
  renderEmail({
    to,
    subject: 'Reset your password',
    intro: 'Use this link to choose a new password. Choosing one logs you out on every device.',
    actionLabel: 'Choose a new password',
    actionUrl: `${env.APP_URL}/reset-password?token=${token}`,
    outro: 'This link works for 1 hour. If you did not ask for it, you can ignore this email.',
  });
