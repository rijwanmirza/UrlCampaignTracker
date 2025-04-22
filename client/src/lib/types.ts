import { CampaignWithUrls, UrlWithActiveStatus } from "@shared/schema";

export interface FormattedCampaign extends CampaignWithUrls {
  activeUrlCount: number;
  totalClicks: number;
  remainingClicks: number;
  redirectMethod: string;
}

export const formatCampaign = (campaign: CampaignWithUrls): FormattedCampaign => {
  const activeUrlCount = campaign.urls.filter(url => url.isActive).length;
  const totalClicks = campaign.urls.reduce((sum, url) => sum + url.clicks, 0);
  const remainingClicks = campaign.urls.reduce((sum, url) => sum + Math.max(0, url.clickLimit - url.clicks), 0);

  return {
    ...campaign,
    activeUrlCount,
    totalClicks,
    remainingClicks,
  };
};

export interface UrlFormValues {
  name: string;
  targetUrl: string;
  clickLimit: number;
}

export interface CampaignFormValues {
  name: string;
  redirectMethod: string;
}
