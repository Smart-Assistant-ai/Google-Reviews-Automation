import { env } from '../../config';
import type { EmailMessage, EmailProvider } from './types';

// Local development and tests: nothing leaves the machine. Links show up in the API logs.
export const sentEmails: EmailMessage[] = [];

export const mockEmailProvider: EmailProvider = {
  async send(message) {
    sentEmails.push(message);
    if (env.NODE_ENV !== 'test') {
      console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    }
  },
};
