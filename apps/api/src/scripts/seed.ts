import { randomBytes } from 'node:crypto';
import '../config';
import { assertSeedAllowed } from '../lib/seed-guard';
import { prisma } from '../lib/prisma';
import { signup } from '../modules/auth/service';
import { completeConnect } from '../modules/google/connect.service';
import { syncLocation } from '../modules/google/sync.service';
import { runDraftQueue } from '../modules/reviews/jobs';
import { SAMPLE_BUSINESS } from '../providers/gbp/fixtures';

const DEMO_EMAIL = 'demo@replypilot.test';

// Creates a demo login with a fake multi-location business, so the app is full straight away.
async function main(): Promise<void> {
  assertSeedAllowed(process.env);

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing)
    await prisma.workspace.deleteMany({ where: { members: { some: { userId: existing.id } } } });
  if (existing) await prisma.user.delete({ where: { id: existing.id } });

  // No password lives in the code. Pick one with DEMO_PASSWORD, or a new one is generated each time.
  const password = process.env.DEMO_PASSWORD ?? randomBytes(9).toString('base64url');
  const userId = await signup(
    { email: DEMO_EMAIL, password, name: 'Demo Owner', businessName: SAMPLE_BUSINESS.title },
    console,
  );
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });

  const member = await prisma.workspaceMember.findFirstOrThrow({ where: { userId } });
  const code = Buffer.from(
    JSON.stringify({ scenario: 'multi', email: SAMPLE_BUSINESS.ownerEmail }),
  ).toString('base64url');
  await completeConnect(member.workspaceId, userId, code);
  await prisma.location.updateMany({
    where: { workspaceId: member.workspaceId },
    data: { status: 'active' },
  });

  const locations = await prisma.location.findMany({ where: { workspaceId: member.workspaceId } });
  for (const location of locations) await syncLocation(location.id);
  while (
    (await prisma.reply.count({ where: { state: 'drafting', workspaceId: member.workspaceId } })) >
    0
  )
    await runDraftQueue();

  console.log(`Demo login: ${DEMO_EMAIL} / ${password}`);
  console.log(`${locations.length} sample locations are ready.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
