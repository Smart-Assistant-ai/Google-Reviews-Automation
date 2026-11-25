import type {
  ActivityItem,
  AuthConfig,
  BillingStatus,
  GoogleStatus,
  Invitation,
  Member,
  ReviewList,
  ReviewTab,
  Review,
  Stats,
  VoiceResponse,
} from '@replypilot/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from './client';

export function useWorkspaceId(): string {
  const { workspace } = useAuth();
  return workspace?.id ?? '';
}

export const wsPath = (workspaceId: string, path: string) => `/workspaces/${workspaceId}${path}`;

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api.get<AuthConfig>('/auth/config'),
    staleTime: 60_000,
  });
}

// The workspace's plan. Every member sees it, so the app can say why drafting has stopped.
export function useBilling() {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['billing', id],
    queryFn: () => api.get<BillingStatus>(wsPath(id, '/billing')),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useGoogleStatus() {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['google-status', id],
    queryFn: () => api.get<GoogleStatus>(wsPath(id, '/google/status')),
    enabled: !!id,
  });
}

export interface ReviewFilters {
  locationId?: string;
  tab: ReviewTab;
  stars?: string;
  q?: string;
  page: number;
  pageSize?: number;
}

export function useReviews(filters: ReviewFilters, poll: boolean) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['reviews', id, filters],
    queryFn: () => api.get<ReviewList>(wsPath(id, '/reviews'), filters),
    enabled: !!id,
    placeholderData: keepPreviousData,
    refetchInterval: poll ? 3000 : false,
  });
}

// How many reviews wait for a reply, for the sidebar and the browser tab. It sits under 'reviews'
// so it refreshes whenever the inbox does, and checks again every minute for newly synced reviews.
export function useTodoCount(locationId?: string) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['reviews', id, 'todo-count', locationId],
    queryFn: () =>
      api
        .get<ReviewList>(wsPath(id, '/reviews'), { tab: 'todo', page: 1, pageSize: 1, locationId })
        .then((res) => res.counts.todo),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useReview(reviewId: string | null, poll: boolean) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['review', id, reviewId],
    queryFn: () => api.get<Review>(wsPath(id, `/reviews/${reviewId}`)),
    enabled: !!id && !!reviewId,
    refetchInterval: poll ? 3000 : false,
  });
}

export function useStats(days: number, locationId?: string) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['stats', id, days, locationId],
    queryFn: () => api.get<Stats>(wsPath(id, '/stats'), { days, locationId }),
    enabled: !!id,
  });
}

export function useVoice(locationId?: string) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['voice', id, locationId ?? 'default'],
    queryFn: () => api.get<VoiceResponse>(wsPath(id, '/voice'), { locationId }),
    enabled: !!id,
  });
}

export function useMembers() {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['members', id],
    queryFn: () =>
      api.get<{ members: Member[] }>(wsPath(id, '/members')).then((res) => res.members),
    enabled: !!id,
  });
}

export function useInvitations(enabled: boolean) {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['invitations', id],
    queryFn: () =>
      api
        .get<{ invitations: Invitation[] }>(wsPath(id, '/invitations'))
        .then((res) => res.invitations),
    enabled: !!id && enabled,
  });
}

export function useActivity() {
  const id = useWorkspaceId();
  return useQuery({
    queryKey: ['activity', id],
    queryFn: () =>
      api.get<{ items: ActivityItem[] }>(wsPath(id, '/activity')).then((res) => res.items),
    enabled: !!id,
  });
}

export function useRefreshWorkspaceData() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries(), [queryClient]);
}
