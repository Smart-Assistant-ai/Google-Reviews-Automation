import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

const encoder = new TextEncoder();

// Google limits replies in bytes, and bcrypt reads only the first 72 bytes of a password.
export const byteLength = (text: string | null | undefined) => encoder.encode(text ?? '').length;

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .refine((value) => byteLength(value) <= 72, 'Use 72 characters or fewer');

export const okResponse = z.object({ ok: z.literal(true) });

export const GOOGLE_REPLY_MAX_BYTES = 4096;
export const DRAFT_TARGET_BYTES = 1500;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: { path: string; message: string }[];
    details?: Record<string, unknown>;
  };
}
