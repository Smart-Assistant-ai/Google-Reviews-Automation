import './load-env';
import { parseEnv } from './env';

export const env = parseEnv(process.env);
export type { Env } from './env';
