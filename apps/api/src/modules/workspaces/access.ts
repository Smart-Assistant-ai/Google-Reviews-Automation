import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export interface MemberContext {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  scopeAllLocations: boolean;
  locationIds: string[];
}

// Owners and admins always reach every location, whatever is stored for them.
const reachesEveryLocation = (member: MemberContext) => member.role !== 'member' || member.scopeAllLocations;

// THE rule for which locations a person can reach. Reviews, replies, stats and voice all go
// through here, so it can't drift between features. `available` locations hold no data yet.
export async function accessibleLocationIds(member: MemberContext): Promise<string[]> {
  const rows = await prisma.location.findMany({
    where: {
      workspaceId: member.workspaceId,
      status: { not: 'available' },
      ...(reachesEveryLocation(member) ? {} : { id: { in: member.locationIds } }),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

// Answers 404 rather than 403, so a person can't learn that a location exists.
export async function assertLocationAccess(member: MemberContext, locationId: string): Promise<void> {
  const allowed = await accessibleLocationIds(member);
  if (!allowed.includes(locationId)) throw notFound('Location not found');
}
