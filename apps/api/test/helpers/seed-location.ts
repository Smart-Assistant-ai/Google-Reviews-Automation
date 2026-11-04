import { prisma } from '../../src/lib/prisma';

let counter = 0;

// A connection and active location written directly, for tests about access rather than Google.
export async function addLocation(workspaceId: string, title = 'Main Street') {
  counter += 1;
  const connection = await prisma.googleConnection.upsert({
    where: { workspaceId_googleUserId: { workspaceId, googleUserId: `seed-${workspaceId}` } },
    create: { workspaceId, provider: 'mock', googleUserId: `seed-${workspaceId}`, googleEmail: 'seed@example.test' },
    update: {},
  });
  return prisma.location.create({
    data: {
      workspaceId,
      connectionId: connection.id,
      googleAccountName: 'accounts/seed',
      googleLocationName: `locations/${counter}-${Date.now()}`,
      title,
      status: 'active',
    },
  });
}
