import '../config';
import { prisma } from '../lib/prisma';
import { allowSignup, disallowSignup, listAllowedSignups } from '../modules/auth/allowlist';

// pnpm allow-signup owner@business.com "Corner Shop"
// pnpm allow-signup --remove owner@business.com
// pnpm allow-signup --list
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const [first, second] = args;
  if (first === '--list') {
    for (const row of await listAllowedSignups())
      console.log(`${row.email}${row.note ? `  (${row.note})` : ''}`);
  } else if (first === '--remove' && second) {
    console.log(
      (await disallowSignup(second)) ? `Removed ${second}` : `${second} was not on the list`,
    );
  } else if (first && !first.startsWith('--')) {
    const row = await allowSignup(first, second);
    console.log(`${row.email} can now sign up.`);
  } else {
    console.log('Usage: pnpm allow-signup <email> [note] | --remove <email> | --list');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
