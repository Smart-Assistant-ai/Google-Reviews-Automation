import type { ApiErrorBody, SessionResponse } from '@replypilot/shared';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  const body = error.response?.data?.error;
  if (body) return new ApiError(body.message, error.response!.status, body.code, body.fields);
  return new ApiError('Could not reach the server. Please try again.', error.response?.status ?? 0, 'network_error');
}

export const http = axios.create({ baseURL: '/api/v1', withCredentials: true });

// The access token lives only in memory, so a script injected into the page can't read it from
// storage. The refresh token is in a cookie that JavaScript can't see at all.
let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionLostHandler = (handler: () => void) => {
  onSessionLost = handler;
};

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<SessionResponse> | null = null;

// Requests that fail together share one refresh, because each refresh replaces the token.
export function refreshSession(): Promise<SessionResponse> {
  refreshing ??= http
    .post<SessionResponse>('/auth/refresh')
    .then((res) => {
      accessToken = res.data.accessToken;
      return res.data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// A 401 from these means something else, such as a wrong password, so refreshing wouldn't help.
const NEVER_REFRESH = /\/auth\/(refresh|login|signup|logout|forgot-password|reset-password|verify-email)$/;

type RetriableConfig = InternalAxiosRequestConfig & { retried?: boolean };

http.interceptors.response.use(undefined, async (error: AxiosError<ApiErrorBody>) => {
  const config = error.config as RetriableConfig | undefined;
  if (error.response?.status === 401 && config && !config.retried && !NEVER_REFRESH.test(config.url ?? '')) {
    config.retried = true;
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionLost();
      throw toApiError(error);
    }
    return http.request(config);
  }
  // A refresh failure reaches here too, already converted on the way out of the retry above.
  if (error instanceof ApiError) throw error;
  throw toApiError(error);
});

export const api = {
  get: <T>(path: string, params?: object) => http.get<T>(path, { params }).then((res) => res.data),
  post: <T>(path: string, body?: object) => http.post<T>(path, body ?? {}).then((res) => res.data),
  put: <T>(path: string, body?: object) => http.put<T>(path, body ?? {}).then((res) => res.data),
  patch: <T>(path: string, body?: object) => http.patch<T>(path, body ?? {}).then((res) => res.data),
  delete: <T>(path: string, body?: object) => http.delete<T>(path, { data: body ?? {} }).then((res) => res.data),
};
