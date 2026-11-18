// What a Google failure means for us, which decides who needs to act.
export type GoogleFailure = 'reconnect' | 'project' | 'location' | 'other';

const API_OFF_REASONS = new Set(['SERVICE_DISABLED', 'ACCESS_NOT_CONFIGURED', 'API_DISABLED']);
const API_OFF_WORDING = /has not been used in project|is disabled|has not been enabled/i;
const LIMIT_WORDING = /not been approved|quota/i;

const apiSwitchedOff = (reason: string | undefined, message: string | undefined) =>
  (reason !== undefined && API_OFF_REASONS.has(reason)) || API_OFF_WORDING.test(message ?? '');

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
    (apiSwitchedOff(reason, message) ||
      reason === 'RATE_LIMIT_EXCEEDED' ||
      LIMIT_WORDING.test(message ?? ''))
  ) {
    return 'project';
  }
  // About this one profile: it was removed, or this account can no longer manage it.
  if (statusCode === 403 || statusCode === 404) return 'location';
  return 'other';
}

// What the business is told about a 'project' failure. Google's own wording, which names the
// project, stays in the location's sync error for whoever runs the app.
export function projectProblem(err: unknown): string {
  const { reason, message } = err as { reason?: string; message?: string };
  return apiSwitchedOff(reason, message)
    ? "A Google API that ReplyPilot needs is switched off, so reviews can't be read yet. They load once it's on, and you can use sample data meanwhile."
    : "Google is limiting ReplyPilot's requests, so reviews can't be read right now. ReplyPilot keeps trying, and you can use sample data meanwhile.";
}
