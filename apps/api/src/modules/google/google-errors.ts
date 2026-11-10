// What a Google failure means for us, which decides who needs to act.
export type GoogleFailure = 'reconnect' | 'project' | 'location' | 'other';

export const NOT_APPROVED_MESSAGE =
  "Google has not approved API access for this project yet, so reviews can't be read. You can use sample data until then.";

const PROJECT_REASONS = new Set([
  'SERVICE_DISABLED',
  'ACCESS_NOT_CONFIGURED',
  'API_DISABLED',
  'RATE_LIMIT_EXCEEDED',
]);
const PROJECT_WORDING =
  /has not been used in project|is disabled|has not been enabled|not been approved|quota/i;

export function classifyGoogleFailure(err: unknown): GoogleFailure {
  const { statusCode, reason, message } = err as {
    statusCode?: number;
    reason?: string;
    message?: string;
  };
  if (statusCode === 401) return 'reconnect';
  // About the whole Google project, such as an API not switched on or a zero quota before approval.
  // Nothing is wrong with the business's own access, so nobody should be told they lost it.
  if (statusCode === 429) return 'project';
  if (
    statusCode === 403 &&
    ((reason && PROJECT_REASONS.has(reason)) || PROJECT_WORDING.test(message ?? ''))
  ) {
    return 'project';
  }
  // About this one profile: it was removed, or this account can no longer manage it.
  if (statusCode === 403 || statusCode === 404) return 'location';
  return 'other';
}
