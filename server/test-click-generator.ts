import { db } from "./db";
import { clickAnalytics } from "@shared/schema";
import { campaigns, urls } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Generates test click analytics data for demo and testing purposes
 * This is used to populate the DB with realistic click data across different
 * time periods so we can properly test the analytics features
 */
async function generateTestClickData() {
  console.log("Starting test click data generation...");
  
  // First, get all campaigns
  const allCampaigns = await db.select().from(campaigns);
  if (!allCampaigns.length) {
    console.log("No campaigns found to generate clicks for");
    return;
  }
  
  // Get the URLs for each campaign
  for (const campaign of allCampaigns) {
    console.log(`Generating clicks for campaign "${campaign.name}" (ID: ${campaign.id})`);
    
    const campaignUrls = await db.select().from(urls).where(eq(urls.campaignId, campaign.id));
    if (!campaignUrls.length) {
      console.log(`No URLs found for campaign ${campaign.id}`);
      continue;
    }
    
    // Generate clicks for past 30 days with different distribution patterns
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    for (const url of campaignUrls) {
      // Generate between 50-200 clicks per URL
      const clickCount = Math.floor(Math.random() * 150) + 50;
      console.log(`Generating ${clickCount} clicks for URL "${url.name}" (ID: ${url.id})`);
      
      const clickData = [];
      
      // Create clicks distributed across the last 30 days
      for (let i = 0; i < clickCount; i++) {
        // Distribute clicks randomly over the last 30 days
        const randomTimeOffset = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);
        const clickTime = new Date(now.getTime() - randomTimeOffset);
        
        // Create more clicks for today, yesterday, and last week to create realistic patterns
        let useClick = true;
        const dayDiff = Math.floor((now.getTime() - clickTime.getTime()) / (24 * 60 * 60 * 1000));
        
        if (dayDiff > 15) {
          // Older clicks are less frequent (50% chance of keeping)
          useClick = Math.random() > 0.5;
        }
        
        if (useClick) {
          // Add random user agents and referrers for variety
          const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Linux; Android 11; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
          ];
          
          const referrers = [
            "https://www.google.com/",
            "https://www.facebook.com/",
            "https://www.youtube.com/",
            "https://www.instagram.com/",
            "https://www.twitter.com/",
            "",  // Direct traffic
          ];
          
          const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
          const referrer = referrers[Math.floor(Math.random() * referrers.length)];
          
          clickData.push({
            urlId: url.id,
            campaignId: campaign.id,
            timestamp: clickTime,
            userAgent,
            referrer,
            ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          });
        }
      }
      
      // Create a batch with more clicks today for the first URL in each campaign
      if (campaignUrls.indexOf(url) === 0) {
        // Add 20-30 clicks for today
        const todayClicks = Math.floor(Math.random() * 10) + 20;
        
        for (let i = 0; i < todayClicks; i++) {
          // Random time today
          const randomHourOffset = Math.floor(Math.random() * 12); // Last 12 hours
          const randomMinuteOffset = Math.floor(Math.random() * 60);
          const clickTime = new Date();
          clickTime.setHours(clickTime.getHours() - randomHourOffset);
          clickTime.setMinutes(clickTime.getMinutes() - randomMinuteOffset);
          
          const userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
          ];
          
          const referrers = [
            "https://www.google.com/",
            "https://www.facebook.com/",
            "https://www.youtube.com/",
            "",  // Direct traffic
          ];
          
          const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
          const referrer = referrers[Math.floor(Math.random() * referrers.length)];
          
          clickData.push({
            urlId: url.id,
            campaignId: campaign.id,
            timestamp: clickTime,
            userAgent,
            referrer,
            ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          });
        }
      }
      
      // Batch insert all clicks
      if (clickData.length > 0) {
        await db.insert(clickAnalytics).values(clickData);
        console.log(`Inserted ${clickData.length} clicks for URL ${url.id}`);
      }
    }
  }
  
  console.log("Test click data generation complete!");
}

export { generateTestClickData };