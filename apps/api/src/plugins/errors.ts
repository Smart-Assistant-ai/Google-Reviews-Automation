import * as Sentry from '@sentry/node';
import type { ApiErrorBody } from '@replypilot/shared';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { HttpError } from '../lib/errors';

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  body: Omit<ApiErrorBody['error'], 'requestId'>,
) {
  return reply
    .code(status)
    .send({ error: { ...body, requestId: request.id } } satisfies ApiErrorBody);
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof HttpError) {
      return send(reply, request, err.statusCode, {
        code: err.code ?? 'error',
        message: err.message,
        details: err.details,
      });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const fields = err.validation.map((issue) => ({
        path: String(issue.instancePath).replace(/^\//, '').replaceAll('/', '.'),
        message: issue.message ?? 'Invalid value',
      }));
      return send(reply, request, 400, {
        code: 'validation_error',
        message: fields[0]?.message ?? 'Some details are not valid',
        fields,
      });
    }

    if (err.statusCode === 429) {
      return send(reply, request, 429, {
        code: 'rate_limited',
        message: 'Too many requests. Please slow down and try again.',
      });
    }

    // A response that doesn't match its schema is our bug, so it must not leak or pass as a 4xx.
    const status = isResponseSerializationError(err) ? 500 : (err.statusCode ?? 500);
    if (status >= 500) {
      request.log.error({ err }, 'request failed');
      Sentry.captureException(err);
      return send(reply, request, 500, {
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
      });
    }

    return send(reply, request, status, {
      code: 'bad_request',
      message: 'That request could not be understood.',
    });
  });

  app.setNotFoundHandler((request, reply) =>
    send(reply, request, 404, { code: 'not_found', message: 'Not found' }),
  );
}
