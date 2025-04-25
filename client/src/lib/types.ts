import { CampaignWithUrls, UrlWithActiveStatus } from "@shared/schema";

export interface FormattedCampaign extends CampaignWithUrls {
  activeUrlCount: number;
  totalClicks: number;
  remainingClicks: number;
  redirectMethod: string;
  // Price related fields
  totalPrice: number;          // Total price based on all required clicks
  remainingPrice: number;      // Remaining price for remaining clicks
  pricePerClick: number;       // Price per individual click
  priceFormatted: string;      // Formatted as "$0.50/$1.00" (remaining/total)
}

export const formatCampaign = (campaign: CampaignWithUrls): FormattedCampaign => {
  // Filter for active URLs (not completed or paused)
  const activeUrls = campaign.urls.filter(url => url.isActive);
  const activeUrlCount = activeUrls.length;
  
  // Only count clicks and limits from active URLs
  const totalClicks = activeUrls.reduce((sum, url) => sum + url.clicks, 0);
  const totalRequiredClicks = activeUrls.reduce((sum, url) => sum + url.clickLimit, 0);
  const remainingClicks = activeUrls.reduce((sum, url) => sum + Math.max(0, url.clickLimit - url.clicks), 0);
  
  // Calculate price related fields (price per 1000 = pricePerThousand)
  const pricePerThousand = typeof campaign.pricePerThousand === 'string' 
    ? parseFloat(campaign.pricePerThousand) 
    : (campaign.pricePerThousand || 0);
  
  const pricePerClick = pricePerThousand / 1000;
  const totalPrice = (totalRequiredClicks * pricePerClick);
  const remainingPrice = (remainingClicks * pricePerClick);
  const priceFormatted = `$${remainingPrice.toFixed(4)}/$${totalPrice.toFixed(4)}`;

  return {
    ...campaign,
    redirectMethod: campaign.redirectMethod || "direct", // Ensure redirectMethod has a default value
    activeUrlCount,
    totalClicks,
    remainingClicks,
    // Price fields
    totalPrice,
    remainingPrice,
    pricePerClick,
    priceFormatted,
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
