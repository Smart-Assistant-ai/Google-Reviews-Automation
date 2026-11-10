import { env } from '../../config';
import type { EmailMessage, EmailProvider } from './types';

export interface SentEmail extends EmailMessage {
  sentAt: string;
}

// Local development and tests: nothing leaves the machine. Emails show up in the local inbox
// page (/dev/outbox) and in the API logs.
export const sentEmails: SentEmail[] = [];

export const mockEmailProvider: EmailProvider = {
  async send(message) {
    sentEmails.push({ ...message, sentAt: new Date().toISOString() });
    if (env.NODE_ENV !== 'test') {
      console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    }
  },
};
