import { PrismaClient } from '@prisma/client';

// One client for the whole process, so the connection pool isn't multiplied by each file that needs it.
export const prisma = new PrismaClient();
