import { z } from 'zod';
import { uuidSchema } from './common';

export const reviewStatusSchema = z.enum([
  'needs_reply',
  'backlog',
  'drafting',
  'draft',
  'posting',
  'pending',
  'live',
  'rejected',
  'failed',
]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const replySchema = z.object({
  id: z.string(),
  text: z.string(),
  source: z.enum(['ai', 'human', 'google']),
  state: z.enum(['drafting', 'draft', 'posting', 'pending_google', 'live', 'rejected', 'failed']),
  googleReplyState: z.string().nullable(),
  policyViolation: z.string().nullable(),
  error: z.string().nullable(),
  postedAt: z.string().nullable(),
});
export type Reply = z.infer<typeof replySchema>;

export const reviewSchema = z.object({
  id: z.string(),
  location: z.object({ id: z.string(), title: z.string() }),
  reviewerName: z.string().nullable(),
  reviewerPhotoUrl: z.string().nullable(),
  starRating: z.number(),
  comment: z.string().nullable(),
  media: z.array(z.unknown()),
  createTime: z.string(),
  language: z.string().nullable(),
  sentiment: z.string().nullable(),
  topics: z.array(z.string()),
  status: reviewStatusSchema,
  purged: z.boolean(),
  reply: replySchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewTabSchema = z.enum(['todo', 'posted', 'backlog', 'all']);
export type ReviewTab = z.infer<typeof reviewTabSchema>;

export const reviewListQuery = z.object({
  locationId: uuidSchema.optional(),
  tab: reviewTabSchema.default('todo'),
  stars: z
    .string()
    .regex(/^[1-5](,[1-5])*$/)
    .optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const reviewCountsSchema = z.object({
  todo: z.number(),
  posted: z.number(),
  backlog: z.number(),
  all: z.number(),
});
export type ReviewCounts = z.infer<typeof reviewCountsSchema>;

export const reviewListResponse = z.object({
  reviews: z.array(reviewSchema),
  counts: reviewCountsSchema,
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});
export type ReviewList = z.infer<typeof reviewListResponse>;

const replyText = z.string().max(20_000);
export const saveReplyBody = z.object({ text: replyText });
export const regenerateReplyBody = z.object({
  instructions: z.string().trim().max(500).optional(),
});
export const postReplyBody = z.object({ text: replyText.optional() });

export const simulateReviewBody = z.object({
  locationId: uuidSchema,
  stars: z.number().int().min(1).max(5).optional(),
  text: z.string().max(2000).optional(),
  name: z.string().max(120).optional(),
});

const optionalText = z.string().trim().max(2000).nullable().optional();

export const voiceBody = z.object({
  businessName: z.string().trim().max(120).nullable().optional(),
  tone: z.enum(['warm', 'professional', 'playful']).optional(),
  signOff: z.string().trim().max(200).nullable().optional(),
  ownerName: z.string().trim().max(120).nullable().optional(),
  alwaysSay: optionalText,
  neverSay: optionalText,
  languageMode: z.enum(['match', 'english']).optional(),
});

export const voiceSchema = z.object({
  businessName: z.string().nullable(),
  tone: z.enum(['warm', 'professional', 'playful']),
  signOff: z.string().nullable(),
  ownerName: z.string().nullable(),
  alwaysSay: z.string().nullable(),
  neverSay: z.string().nullable(),
  languageMode: z.enum(['match', 'english']),
});
export type Voice = z.infer<typeof voiceSchema>;

export const voiceQuery = z.object({ locationId: uuidSchema.optional() });
export const voiceResponse = z.object({
  voice: voiceSchema,
  isOverride: z.boolean(),
  drafter: z.enum(['openai', 'template']),
});
export type VoiceResponse = z.infer<typeof voiceResponse>;

export const statsQuery = z.object({
  days: z.coerce.number().int().min(1).max(730).default(90),
  locationId: uuidSchema.optional(),
});

const nullableNumber = z.number().nullable();
export const statsResponse = z.object({
  rangeDays: z.number(),
  kpis: z.object({
    avgRating: nullableNumber,
    avgRatingDelta: nullableNumber,
    totalReviews: z.number(),
    previousTotal: z.number(),
    responseRate: nullableNumber,
    avgResponseHours: nullableNumber,
    awaitingReply: z.number(),
  }),
  starDistribution: z.array(z.object({ stars: z.number(), count: z.number() })),
  weekly: z.array(
    z.object({
      week: z.string(),
      1: z.number(),
      2: z.number(),
      3: z.number(),
      4: z.number(),
      5: z.number(),
      avgRating: nullableNumber,
      total: z.number(),
    }),
  ),
  sentiment: z.object({ positive: z.number(), neutral: z.number(), negative: z.number() }),
  topics: z.array(
    z.object({
      topic: z.string(),
      positive: z.number(),
      negative: z.number(),
      neutral: z.number(),
    }),
  ),
});
export type Stats = z.infer<typeof statsResponse>;
