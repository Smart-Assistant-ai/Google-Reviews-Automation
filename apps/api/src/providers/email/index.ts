import { env } from '../../config';
import { mockEmailProvider } from './mock';
import { resendProvider } from './resend';
import type { EmailMessage, EmailProvider } from './types';

const provider: EmailProvider =
  env.EMAIL_PROVIDER === 'resend' ? resendProvider(env.RESEND_API_KEY!, env.EMAIL_FROM) : mockEmailProvider;

export async function sendEmail(message: EmailMessage): Promise<void> {
  await provider.send(message);
}

// For emails that shouldn't fail the request around them. The person can always ask for it again.
export async function sendEmailSafely(message: EmailMessage, log: { error: (obj: object, msg: string) => void }): Promise<boolean> {
  try {
    await sendEmail(message);
    return true;
  } catch (err) {
    log.error({ err, subject: message.subject }, 'email failed to send');
    return false;
  }
}

export type { EmailMessage } from './types';
