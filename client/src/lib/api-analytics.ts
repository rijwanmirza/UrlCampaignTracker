import { AnalyticsFilter, AnalyticsResponse } from '@shared/schema';
import { apiRequest } from './queryClient';

/**
 * Get analytics data based on filter
 */
export async function getAnalytics(filter: AnalyticsFilter): Promise<AnalyticsResponse> {
  const response = await apiRequest('POST', '/api/analytics', filter);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get analytics data');
  }
  
  return data.data;
}

/**
 * Get list of campaigns for analytics selection
 */
export async function getCampaignsList(): Promise<{ id: number, name: string }[]> {
  const response = await apiRequest('GET', '/api/analytics/campaigns');
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get campaigns list');
  }
  
  return data.data;
}

/**
 * Get list of URLs for analytics selection
 */
export async function getUrlsList(search?: string): Promise<{ id: number, name: string, campaignId: number }[]> {
  const queryParams = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await apiRequest('GET', `/api/analytics/urls${queryParams}`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to get URLs list');
  }
  
  return data.data;
}