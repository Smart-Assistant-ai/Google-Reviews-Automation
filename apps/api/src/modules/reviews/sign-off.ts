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

// The sign-offs earlier replies ended with. An ordinary closing sentence, such as "Please contact us
// directly.", is part of the reply, not a sign-off, so it's left out: a sign-off is a name, often
// after a dash, like "– The Team" or "Best, Sam", and a line ending like a sentence only counts when
// it starts with a dash.
export function earlierSignOffs(replies: string[]): string[] {
  return replies
    .map((reply) => splitEnding(reply).ending)
    .filter((ending): ending is string => ending !== null)
    .filter((ending) => /^[–—-]/.test(ending) || !/[.!?]$/.test(ending));
}

// Ends a draft with the sign-off exactly once. A last line that is the sign-off already goes first,
// whether the AI put it after a blank line or a single line break. So does one copied from the
// endings of earlier replies, such as a sign-off from before it was changed.
export function withSignOff(draft: string, signOff: string, earlierEndings: string[] = []): string {
  const trimmed = draft.trimEnd();
  const lastBreak = trimmed.lastIndexOf('\n');
  let text: string;
  if (signOff && trimmed.slice(lastBreak + 1).trim() === signOff) {
    text = trimmed.slice(0, Math.max(lastBreak, 0)).trimEnd();
  } else {
    const { body, ending } = splitEnding(trimmed);
    text = ending !== null && earlierEndings.includes(ending) ? body : trimmed;
  }
  if (!signOff) return text;
  return text ? `${text}\n\n${signOff}` : signOff;
}
