import { useQuery, useMutation } from '@tanstack/react-query';
import { AnalyticsFilter, AnalyticsResponse } from '@shared/schema';
import { getAnalytics, getCampaignsList, getUrlsList } from '@/lib/api-analytics';
import { queryClient } from '@/lib/queryClient';
import { useToast } from './use-toast';

/**
 * Hook for fetching analytics data based on filter
 */
export function useAnalytics(filter: AnalyticsFilter) {
  const { toast } = useToast();
  
  return useQuery<AnalyticsResponse, Error>({
    queryKey: ['/api/analytics', filter],
    queryFn: async () => getAnalytics(filter),
    enabled: !!filter.id, // Only run if filter has a selected resource ID
    onError: (error) => {
      toast({
        title: 'Error fetching analytics data',
        description: error.message,
        variant: 'destructive',
      });
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching campaigns list for analytics selection
 */
export function useAnalyticsCampaigns() {
  const { toast } = useToast();
  
  return useQuery<{ id: number, name: string }[], Error>({
    queryKey: ['/api/analytics/campaigns'],
    queryFn: async () => getCampaignsList(),
    onError: (error) => {
      toast({
        title: 'Error fetching campaigns list',
        description: error.message,
        variant: 'destructive',
      });
    },
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching URLs list for analytics selection with optional search
 */
export function useAnalyticsUrls(search?: string) {
  const { toast } = useToast();
  
  return useQuery<{ id: number, name: string, campaignId: number }[], Error>({
    queryKey: ['/api/analytics/urls', search],
    queryFn: async () => getUrlsList(search),
    onError: (error) => {
      toast({
        title: 'Error fetching URLs list',
        description: error.message,
        variant: 'destructive',
      });
    },
    refetchOnWindowFocus: false,
  });
}