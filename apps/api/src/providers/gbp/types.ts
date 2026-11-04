export interface GbpReply {
  comment: string;
  updateTime?: string;
  replyState?: 'PENDING' | 'APPROVED' | 'REJECTED';
  policyViolation?: string;
}

export interface GbpReview {
  name: string;
  reviewId?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string | null; isAnonymous?: boolean };
  starRating: string;
  comment?: string;
  createTime: string;
  updateTime?: string;
  reviewReply?: GbpReply;
  reviewMediaItems?: unknown[];
}

export interface GbpAccount {
  name: string;
  accountName?: string;
}

export interface GbpLocation {
  name: string;
  title: string;
  storefrontAddress?: { addressLines?: string[] };
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  email: string;
  googleUserId: string;
}

export interface GbpContext {
  connection: { id: string; googleUserId: string; dataSource: string };
  getAccessToken: () => Promise<string>;
}

export interface GbpProvider {
  kind: 'mock' | 'live';
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleTokens>;
  refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }>;
  revoke(token: string): Promise<void>;
  listAccounts(
    ctx: GbpContext,
    pageToken?: string,
  ): Promise<{ accounts?: GbpAccount[]; nextPageToken?: string }>;
  listLocations(
    ctx: GbpContext,
    accountName: string,
    pageToken?: string,
  ): Promise<{ locations?: GbpLocation[]; nextPageToken?: string }>;
  listReviews(
    ctx: GbpContext,
    accountName: string,
    locationName: string,
    pageToken?: string,
  ): Promise<{ reviews?: GbpReview[]; nextPageToken?: string }>;
  getReview(ctx: GbpContext, reviewName: string): Promise<GbpReview>;
  updateReply(ctx: GbpContext, reviewName: string, comment: string): Promise<GbpReply>;
  deleteReply(ctx: GbpContext, reviewName: string): Promise<void>;
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly googleStatus?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}
