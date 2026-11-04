import { z } from 'zod';
import { emailSchema, passwordSchema } from './common';
import { memberRoleSchema } from './permissions';

const nameSchema = z.string().trim().min(1).max(120);

export const signupBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
  businessName: nameSchema.optional(),
  inviteToken: z.string().min(1).optional(),
});

export const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(1000),
});

export const verifyEmailBody = z.object({ token: z.string().min(1) });
export const forgotPasswordBody = z.object({ email: emailSchema });
export const resetPasswordBody = z.object({ token: z.string().min(1), password: passwordSchema });
export const changePasswordBody = z.object({
  currentPassword: z.string().max(1000).optional(),
  newPassword: passwordSchema,
});
export const updateProfileBody = z.object({ name: nameSchema });
export const deleteAccountBody = z.object({ password: z.string().max(1000).optional() });

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  emailVerified: z.boolean(),
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: memberRoleSchema,
  scopeAllLocations: z.boolean(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const meResponse = z.object({
  user: userSchema,
  workspaces: z.array(workspaceSummarySchema),
});
export type Me = z.infer<typeof meResponse>;

export const sessionResponse = meResponse.extend({ accessToken: z.string() });
export type SessionResponse = z.infer<typeof sessionResponse>;

export const authConfigResponse = z.object({
  signupMode: z.enum(['allowlist', 'open']),
  googleSignIn: z.boolean(),
});
export type AuthConfig = z.infer<typeof authConfigResponse>;
