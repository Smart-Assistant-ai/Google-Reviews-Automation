import { z } from 'zod';
import { emailSchema, uuidSchema } from './common';
import { memberRoleSchema } from './permissions';

const workspaceName = z.string().trim().min(1).max(120);

export const createWorkspaceBody = z.object({ name: workspaceName });
export const updateWorkspaceBody = z.object({ name: workspaceName });

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: memberRoleSchema,
  scopeAllLocations: z.boolean(),
});

// Owner is never assigned directly. Ownership moves only through a transfer.
const assignableRole = z.enum(['admin', 'member']);

export const memberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: memberRoleSchema,
  scopeAllLocations: z.boolean(),
  locationIds: z.array(z.string()),
  isYou: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const updateMemberBody = z.object({
  role: assignableRole.optional(),
  scopeAllLocations: z.boolean().optional(),
  locationIds: z.array(uuidSchema).optional(),
});

export const transferOwnershipBody = z.object({ memberId: uuidSchema });

export const createInvitationBody = z.object({
  email: emailSchema,
  role: assignableRole.default('member'),
  scopeAllLocations: z.boolean().default(true),
  locationIds: z.array(uuidSchema).default([]),
});

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  scopeAllLocations: z.boolean(),
  locationIds: z.array(z.string()),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationPreviewResponse = z.object({
  workspaceName: z.string(),
  email: z.string(),
  role: memberRoleSchema,
  accountExists: z.boolean(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewResponse>;

export const acceptInvitationBody = z.object({ token: z.string().min(1) });

export const activityItemSchema = z.object({
  id: z.string(),
  action: z.string(),
  actorName: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  meta: z.record(z.unknown()),
  createdAt: z.string(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const workspaceListResponse = z.object({ workspaces: z.array(workspaceSchema) });
export const memberListResponse = z.object({ members: z.array(memberSchema) });
export const invitationListResponse = z.object({ invitations: z.array(invitationSchema) });
export const createdInvitationResponse = invitationSchema.extend({ emailSent: z.boolean() });
export const activityResponse = z.object({ items: z.array(activityItemSchema) });
export const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
