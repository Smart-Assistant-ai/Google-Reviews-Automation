// How every draft ends, whoever wrote it. The code adds the sign-off itself rather than trusting
// the AI to, so a draft always ends with the voice's current sign-off, typed exactly as saved.

export interface SignOffVoice {
  signOff: string | null;
  ownerName: string | null;
}

// The voice's sign-off, or "– <owner name>" when only an owner name is set.
export function signOffFor(voice: SignOffVoice): string {
  const own = voice.signOff?.trim();
  if (own) return own;
  const owner = voice.ownerName?.trim();
  return owner ? `– ${owner}` : '';
}

// A sign-off is a short last line in a paragraph of its own.
const MAX_ENDING = 200;

// Splits a reply into its body and the short line it ends with, if it ends with one.
export function splitEnding(reply: string): { body: string; ending: string | null } {
  const text = reply.trimEnd();
  const at = text.lastIndexOf('\n\n');
  const ending = at === -1 ? '' : text.slice(at + 2).trim();
  if (!ending || ending.includes('\n') || ending.length > MAX_ENDING) {
    return { body: text, ending: null };
  }
  return { body: text.slice(0, at).trimEnd(), ending };
}

// Ends a draft with the sign-off exactly once. A last line that is the sign-off already, or one
// copied from the endings of earlier replies, such as a sign-off from before it was changed, goes
// first.
export function withSignOff(draft: string, signOff: string, earlierEndings: string[] = []): string {
  const { body, ending } = splitEnding(draft);
  const stale = ending !== null && (ending === signOff || earlierEndings.includes(ending));
  const text = stale ? body : draft.trimEnd();
  return signOff ? `${text}\n\n${signOff}` : text;
}
