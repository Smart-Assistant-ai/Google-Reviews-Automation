import { describe, expect, it } from 'vitest';
import { PAGES, render } from './prerender';

// Google's verification reads these pages without running JavaScript. If one of them renders as
// a spinner, or as something else, verification fails with "the home page is behind a login".
const text = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('pages built ahead of time', () => {
  it('builds the home page, privacy policy and terms', () => {
    expect(Object.keys(PAGES).sort()).toEqual(['/', '/privacy', '/terms']);
  });

  it('home page names the app, says what it does with Google data and links the policy', () => {
    const html = render('/');
    const page = text(html);
    expect(page).toContain('ReplyPilot brings the reviews from your Google Business Profile');
    expect(page).toContain('What ReplyPilot does with your Google data');
    expect(page).toContain('It never creates or edits images');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it('privacy policy has its full text, including the Limited Use statement', () => {
    const page = text(render('/privacy'));
    expect(page).toContain('Privacy policy');
    expect(page).toContain('Information we receive from Google');
    expect(page).toContain('including the Limited Use requirements');
  });

  it('terms page has its text', () => {
    expect(text(render('/terms'))).toContain('Terms of service');
  });
});
