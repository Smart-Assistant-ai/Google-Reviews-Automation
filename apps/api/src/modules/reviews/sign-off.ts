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

// Ends like a sentence, in any language the AI replies in: "." and "!" as well as "。", "؟" or "।".
const SENTENCE_END = /[\p{Sentence_Terminal}…]$/u;

// The sign-offs earlier replies ended with. An ordinary closing sentence, such as "Please contact us
// directly.", is part of the reply, not a sign-off, so it's left out: a sign-off is a name, often
// after a dash, like "– The Team" or "Best, Sam", and a line ending like a sentence only counts when
// it starts with a dash.
export function earlierSignOffs(replies: string[]): string[] {
  return replies
    .map((reply) => splitEnding(reply).ending)
    .filter((ending): ending is string => ending !== null)
    .filter((ending) => /^[–—-]/.test(ending) || !SENTENCE_END.test(ending));
}

const linesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

// The text without its last lines when they are exactly the ending's lines, such as "Best," then
// "Sam", wherever the line breaks fall before it. Null when the text doesn't end that way. Whole
// lines only, so a sign-off of "Sam" never cuts the end off "Ask for Sam".
function withoutEnding(text: string, ending: string): string | null {
  const want = linesOf(ending);
  const lines = text.split('\n');
  const kept = [...lines];
  for (let i = want.length - 1; i >= 0; i -= 1) {
    while (kept.length && !kept.at(-1)!.trim()) kept.pop();
    if (kept.pop()?.trim() !== want[i]) return null;
  }
  return want.length ? kept.join('\n').trimEnd() : null;
}

// Ends a draft with the sign-off exactly once. A sign-off the draft already ends with goes first,
// after a blank line or a single line break, on one line or several. So does one copied from the
// endings of earlier replies, such as a sign-off from before it was changed.
export function withSignOff(draft: string, signOff: string, earlierEndings: string[] = []): string {
  let text = draft.trimEnd();
  for (const ending of [signOff, ...earlierEndings]) {
    const cut = ending ? withoutEnding(text, ending) : null;
    if (cut !== null) {
      text = cut;
      break;
    }
  }
  if (!signOff) return text;
  return text ? `${text}\n\n${signOff}` : signOff;
}
