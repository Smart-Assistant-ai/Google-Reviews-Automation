import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, http, setAccessToken, setSessionLostHandler } from './client';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };

function useServer(handler: Handler) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const { status, data } = handler(config);
    const response = { data, status, statusText: '', headers: {}, config };
    if (status >= 400) throw new AxiosError('failed', undefined, config, undefined, response);
    return response;
  };
  http.defaults.adapter = adapter;
  return calls;
}

const session = (token: string) => ({ accessToken: token, user: {}, workspaces: [] });

beforeEach(() => {
  setAccessToken('old');
  setSessionLostHandler(() => {});
});

describe('api client', () => {
  it('sends the access token', async () => {
    const calls = useServer(() => ({ status: 200, data: { ok: true } }));
    await api.get('/thing');
    expect(calls[0]?.headers.Authorization).toBe('Bearer old');
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    const calls = useServer((config) => {
      if (config.url === '/auth/refresh') return { status: 200, data: session('new') };
      return config.headers.Authorization === 'Bearer new' ? { status: 200, data: { value: 1 } } : { status: 401, data: {} };
    });
    await expect(api.get('/thing')).resolves.toEqual({ value: 1 });
    expect(calls.map((c) => c.url)).toEqual(['/thing', '/auth/refresh', '/thing']);
  });

  it('shares one refresh between requests that fail together', async () => {
    const calls = useServer((config) => {
      if (config.url === '/auth/refresh') return { status: 200, data: session('new') };
      return config.headers.Authorization === 'Bearer new' ? { status: 200, data: { url: config.url } } : { status: 401, data: {} };
    });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calls.filter((c) => c.url === '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the refresh fails, instead of looping', async () => {
    const lost = vi.fn();
    setSessionLostHandler(lost);
    const calls = useServer(() => ({ status: 401, data: { error: { code: 'unauthorized', message: 'Please log in', requestId: 'r' } } }));
    await expect(api.get('/thing')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.url)).toEqual(['/thing', '/auth/refresh']);
  });

  it('does not try to refresh after a wrong password', async () => {
    const lost = vi.fn();
    setSessionLostHandler(lost);
    const calls = useServer(() => ({ status: 401, data: { error: { code: 'invalid_credentials', message: 'Invalid email or password', requestId: 'r' } } }));
    await expect(api.post('/auth/login', {})).rejects.toMatchObject({ message: 'Invalid email or password', code: 'invalid_credentials' });
    expect(calls).toHaveLength(1);
    expect(lost).not.toHaveBeenCalled();
  });

  it('gives friendly errors with the code and the failed fields', async () => {
    useServer(() => ({
      status: 400,
      data: { error: { code: 'validation_error', message: 'Enter a valid email', requestId: 'r', fields: [{ path: 'email', message: 'Enter a valid email' }] } },
    }));
    await expect(api.post('/x', {})).rejects.toMatchObject({ status: 400, code: 'validation_error', fields: [{ path: 'email', message: 'Enter a valid email' }] });
  });
});
