import { db } from "./db";
import { clickAnalytics } from "@shared/schema";
import { campaigns, urls } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Generates test click analytics data for demo and testing purposes
 * This is used to populate the DB with realistic click data across different
 * time periods so we can properly test the analytics features
 */
async function generateTestClickData() {
  console.log("Starting test click data generation...");
  
  // Clear existing test data to avoid duplication
  try {
    // Delete existing click analytics data - only for testing purposes
    // In production, we would never delete real analytics data
    await db.execute(sql`TRUNCATE TABLE ${clickAnalytics}`);
    console.log("Cleared existing click analytics data");
  } catch (error) {
    console.error("Error clearing existing click data:", error);
  }
  
  // First, get all campaigns
  const allCampaigns = await db.select().from(campaigns);
  if (!allCampaigns.length) {
    console.log("No campaigns found to generate clicks for");
    return { success: false, message: "No campaigns found to generate clicks for" };
  }
  
  // Get the URLs for each campaign
  let totalClicksGenerated = 0;
  
  for (const campaign of allCampaigns) {
    console.log(`Generating clicks for campaign "${campaign.name}" (ID: ${campaign.id})`);
    
    const campaignUrls = await db.select().from(urls).where(eq(urls.campaignId, campaign.id));
    if (!campaignUrls.length) {
      console.log(`No URLs found for campaign ${campaign.id}`);
      continue;
    }
    
    // Generate clicks for various time periods
    const now = new Date();
    
    // Generate clicks for each hour of today
    await generateHourlyClicksForToday(campaign, campaignUrls[0]);
    
    // Generate clicks for yesterday
    await generateClicksForYesterday(campaign, campaignUrls[0]);
    
    // Generate clicks for the past week
    await generateClicksForPastWeek(campaign, campaignUrls);
    
    // Generate clicks for the past month
    await generateClicksForPastMonth(campaign, campaignUrls);
    
    // Count total clicks inserted for this campaign
    const clicksCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM click_analytics 
      WHERE "campaignId" = ${campaign.id}
    `);
    
    const campaignClickCount = parseInt(clicksCount.rows[0].count);
    totalClicksGenerated += campaignClickCount;
    
    console.log(`Generated ${campaignClickCount} total clicks for campaign ${campaign.id}`);
  }
  
  console.log(`Test click data generation complete! Generated ${totalClicksGenerated} total clicks.`);
  return { success: true, totalClicks: totalClicksGenerated };
}

/**
 * Generate clicks for each hour of the current day
 */
async function generateHourlyClicksForToday(campaign, url) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clicksPerHour = [];
  
  // Generate clicks for each hour (0-23)
  for (let hour = 0; hour <= now.getHours(); hour++) {
    // More clicks during business hours (9-17)
    let clickCount = Math.floor(Math.random() * 5) + 1; // 1-5 clicks by default
    
    if (hour >= 9 && hour <= 17) {
      clickCount = Math.floor(Math.random() * 15) + 5; // 5-20 clicks during business hours
    }
    
    // Create timestamp for this hour with random minutes and seconds
    for (let i = 0; i < clickCount; i++) {
      const clickTime = new Date(today);
      clickTime.setHours(hour);
      clickTime.setMinutes(Math.floor(Math.random() * 60));
      clickTime.setSeconds(Math.floor(Math.random() * 60));
      
      // Don't create clicks in the future
      if (clickTime <= now) {
        clicksPerHour.push(createClickData(url, campaign, clickTime));
      }
    }
  }
  
  // Batch insert all today's hourly clicks
  if (clicksPerHour.length > 0) {
    await db.insert(clickAnalytics).values(clicksPerHour);
    console.log(`Inserted ${clicksPerHour.length} hourly clicks for today for campaign ${campaign.id}`);
  }
}

/**
 * Generate clicks for yesterday
 */
async function generateClicksForYesterday(campaign, url) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const clicksYesterday = [];
  
  // Generate full day of clicks for yesterday
  for (let hour = 0; hour < 24; hour++) {
    // More clicks during business hours (9-17)
    let clickCount = Math.floor(Math.random() * 3) + 1; // 1-3 clicks by default
    
    if (hour >= 9 && hour <= 17) {
      clickCount = Math.floor(Math.random() * 10) + 3; // 3-13 clicks during business hours
    }
    
    // Create timestamp for this hour with random minutes and seconds
    for (let i = 0; i < clickCount; i++) {
      const clickTime = new Date(yesterday);
      clickTime.setHours(hour);
      clickTime.setMinutes(Math.floor(Math.random() * 60));
      clickTime.setSeconds(Math.floor(Math.random() * 60));
      
      clicksYesterday.push(createClickData(url, campaign, clickTime));
    }
  }
  
  // Batch insert all yesterday's clicks
  if (clicksYesterday.length > 0) {
    await db.insert(clickAnalytics).values(clicksYesterday);
    console.log(`Inserted ${clicksYesterday.length} clicks for yesterday for campaign ${campaign.id}`);
  }
}

/**
 * Generate clicks for the past week
 */
async function generateClicksForPastWeek(campaign, campaignUrls) {
  const now = new Date();
  const pastWeekClicks = [];
  
  // Generate clicks for the past 7 days (excluding today and yesterday)
  for (let dayOffset = 2; dayOffset < 7; dayOffset++) {
    const pastDay = new Date(now);
    pastDay.setDate(now.getDate() - dayOffset);
    pastDay.setHours(0, 0, 0, 0);
    
    // Distribute clicks across all campaign URLs
    for (const url of campaignUrls) {
      // Generate 20-50 clicks per day per URL
      const dailyClicks = Math.floor(Math.random() * 30) + 20;
      
      for (let i = 0; i < dailyClicks; i++) {
        // Random hour of the day
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);
        
        const clickTime = new Date(pastDay);
        clickTime.setHours(hour, minute, second);
        
        pastWeekClicks.push(createClickData(url, campaign, clickTime));
      }
    }
  }
  
  // Batch insert all past week clicks
  if (pastWeekClicks.length > 0) {
    // Insert in batches to avoid memory issues
    const batchSize = 1000;
    for (let i = 0; i < pastWeekClicks.length; i += batchSize) {
      const batch = pastWeekClicks.slice(i, i + batchSize);
      await db.insert(clickAnalytics).values(batch);
    }
    
    console.log(`Inserted ${pastWeekClicks.length} clicks for past week for campaign ${campaign.id}`);
  }
}

/**
 * Generate clicks for the past month
 */
async function generateClicksForPastMonth(campaign, campaignUrls) {
  const now = new Date();
  const pastMonthClicks = [];
  
  // Generate clicks for days 7-30 (past month excluding the past week)
  for (let dayOffset = 7; dayOffset < 30; dayOffset++) {
    const pastDay = new Date(now);
    pastDay.setDate(now.getDate() - dayOffset);
    pastDay.setHours(0, 0, 0, 0);
    
    // Only generate clicks for half of the URLs (to simulate some URLs being inactive)
    for (let i = 0; i < Math.ceil(campaignUrls.length / 2); i++) {
      const url = campaignUrls[i];
      
      // Generate 10-30 clicks per day per URL
      const dailyClicks = Math.floor(Math.random() * 20) + 10;
      
      for (let j = 0; j < dailyClicks; j++) {
        // Random hour of the day
        const hour = Math.floor(Math.random() * 24);
        const minute = Math.floor(Math.random() * 60);
        const second = Math.floor(Math.random() * 60);
        
        const clickTime = new Date(pastDay);
        clickTime.setHours(hour, minute, second);
        
        pastMonthClicks.push(createClickData(url, campaign, clickTime));
      }
    }
  }
  
  // Batch insert all past month clicks
  if (pastMonthClicks.length > 0) {
    // Insert in batches to avoid memory issues
    const batchSize = 1000;
    for (let i = 0; i < pastMonthClicks.length; i += batchSize) {
      const batch = pastMonthClicks.slice(i, i + batchSize);
      await db.insert(clickAnalytics).values(batch);
    }
    
    console.log(`Inserted ${pastMonthClicks.length} clicks for past month for campaign ${campaign.id}`);
  }
}

/**
 * Helper function to create click data object
 */
function createClickData(url, campaign, timestamp) {
  // Only track the essential data as per requirements
  // We don't want to track any user agent, IP address, or referrer information
  return {
    urlId: url.id,
    campaignId: campaign.id,
    timestamp: timestamp
  };
}

export { generateTestClickData };