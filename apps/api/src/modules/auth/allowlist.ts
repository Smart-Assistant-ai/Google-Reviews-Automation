import { emailSchema } from '@replypilot/shared';
import { prisma } from '../../lib/prisma';

export async function allowSignup(emailInput: string, note?: string, addedBy = 'cli') {
  const email = emailSchema.parse(emailInput);
  return prisma.signupAllowlist.upsert({
    where: { email },
    create: { email, note, addedBy },
    update: { note },
  });
}

export async function disallowSignup(emailInput: string): Promise<boolean> {
  const email = emailSchema.parse(emailInput);
  const removed = await prisma.signupAllowlist.deleteMany({ where: { email } });
  return removed.count > 0;
}

export const listAllowedSignups = () =>
  prisma.signupAllowlist.findMany({ orderBy: { createdAt: 'desc' } });
