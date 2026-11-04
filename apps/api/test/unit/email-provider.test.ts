import { afterEach, describe, expect, it, vi } from 'vitest';
import { resendProvider } from '../../src/providers/email/resend';

afterEach(() => vi.unstubAllGlobals());

const message = { to: 'owner@business.com', subject: 'Hello', text: 'Plain', html: '<p>Plain</p>' };

describe('resendProvider', () => {
  it('sends the message to Resend with the API key', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await resendProvider('re_key', 'From <a@b.com>').send(message);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({ from: 'From <a@b.com>', to: ['owner@business.com'], subject: 'Hello' });
  });

  it('reports a failed send instead of pretending it worked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })));
    await expect(resendProvider('re_key', 'From <a@b.com>').send(message)).rejects.toThrow(/422/);
  });
});
