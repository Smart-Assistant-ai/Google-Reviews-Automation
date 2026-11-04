// An error that is safe to show the user. Anything else becomes a generic 500.
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what, 'not_found');
