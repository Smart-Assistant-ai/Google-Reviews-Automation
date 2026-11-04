import { z } from 'zod';
import { uuidSchema } from './common';

export const connectionSchema = z.object({
  id: z.string(),
  provider: z.enum(['mock', 'live']),
  email: z.string().nullable(),
  status: z.enum(['healthy', 'needs_reconnect']),
  sample: z.boolean(),
  apiError: z.string().nullable(),
  locationCount: z.number(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const locationStatusSchema = z.enum(['available', 'active', 'access_lost']);

export const locationSchema = z.object({
  id: z.string(),
  title: z.string(),
  address: z.string().nullable(),
  status: locationStatusSchema,
  sample: z.boolean(),
  connectionId: z.string(),
  connectionEmail: z.string().nullable(),
  alternativeConnections: z.array(z.object({ id: z.string(), email: z.string().nullable() })),
  lastSyncedAt: z.string().nullable(),
  lastSyncError: z.string().nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const googleStatusResponse = z.object({
  connections: z.array(connectionSchema),
  locations: z.array(locationSchema),
});
export type GoogleStatus = z.infer<typeof googleStatusResponse>;

export const startConnectResponse = z.object({ url: z.string(), provider: z.enum(['mock', 'live']) });

export const selectLocationsBody = z.object({ locationIds: z.array(uuidSchema).min(1) });
export const switchConnectionBody = z.object({ connectionId: uuidSchema });
export const syncBody = z.object({ locationId: uuidSchema.optional() });

export const syncResponse = z.object({ synced: z.number(), fetched: z.number(), created: z.number() });

export const disconnectPreviewResponse = z.object({
  removes: z.array(z.object({ id: z.string(), title: z.string() })),
  moves: z.array(z.object({ id: z.string(), title: z.string(), toEmail: z.string().nullable() })),
});
export type DisconnectPreview = z.infer<typeof disconnectPreviewResponse>;
