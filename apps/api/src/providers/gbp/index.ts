import { env } from '../../config';
import { liveGbpProvider } from './live';
import { mockGbpProvider } from './mock';
import type { GbpProvider } from './types';

export function getProvider(kind: 'mock' | 'live' = env.GBP_PROVIDER): GbpProvider {
  return kind === 'live' ? liveGbpProvider : mockGbpProvider;
}

export const STAR_TO_NUMBER: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export * from './types';
