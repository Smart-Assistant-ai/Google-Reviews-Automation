import { config } from 'dotenv';

// The file wins over whatever the process manager remembered from an earlier start.
if (process.env.NODE_ENV !== 'test') {
  config({ path: process.env.ENV_FILE ?? '.env', override: true });
}
