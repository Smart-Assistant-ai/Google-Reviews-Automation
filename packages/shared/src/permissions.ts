import { z } from 'zod';

export const memberRoleSchema = z.enum(['owner', 'admin', 'member']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

const RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

// The one rule for role order. The API enforces it, and the web app uses it to hide controls.
export const hasAtLeast = (role: MemberRole, minimum: MemberRole) => RANK[role] >= RANK[minimum];
