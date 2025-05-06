/**
 * URL Budget Tracker
 * 
 * This module manages tracking URL budgets and updating TrafficStar campaign budgets.
 * It logs each URL's remaining clicks and budget value when campaigns are started,
 * and tracks new URLs that are added to campaigns for budget updates.
 */

import fs from 'fs';
import path from 'path';
import { Url, Campaign } from '@shared/schema';
import { trafficStarService } from './trafficstar-service-new';
import { db } from './db';
import { eq, and } from 'drizzle-orm';
import { campaigns, urls } from '@shared/schema';

interface UrlBudgetEntry {
  urlId: number;
  clickCount: number;      // This can be either remaining clicks or required clicks based on context
  isRemainingCount: boolean; // Flag to indicate if clickCount is remaining clicks or full required clicks
  budgetValue: number;
  timestamp: string;
  processed: boolean;
  campaignId: number;
}

export class UrlBudgetTracker {
  private logFilePath: string;
  private pendingUpdates: Map<number, UrlBudgetEntry[]>; // Map of campaignId to pending budget entries
  private updateTimers: Map<number, NodeJS.Timeout>; // Map of campaignId to update timers

  constructor() {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync('url_budget_logs')) {
      fs.mkdirSync('url_budget_logs');
    }
    
    // Create a log file for tracking URL budgets (by date)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFilePath = path.join('url_budget_logs', `url_budgets_${today}.log`);
    
    // Initialize maps for tracking pending updates and timers
    this.pendingUpdates = new Map();
    this.updateTimers = new Map();
    
    console.log(`URL Budget Tracker initialized with log file: ${this.logFilePath}`);
  }
  
  /**
   * Formats a date as UTC in the requested format: DD-MM-YYYY::HH:MM:SS
   */
  private formatUtcDateTime(date = new Date()): string {
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    
    return `${day}-${month}-${year}::${hours}:${minutes}:${seconds}`;
  }
  
  /**
   * Calculates the budget value for a URL based on remaining clicks and price per thousand
   * @param remainingClicks Number of remaining clicks
   * @param pricePerThousand Price per 1000 clicks
   * @returns Budget value in dollars
   */
  private calculateBudgetValue(remainingClicks: number, pricePerThousand: number): number {
    // Convert price per thousand to price per click
    const pricePerClick = pricePerThousand / 1000;
    
    // Calculate total budget value
    return remainingClicks * pricePerClick;
  }
  
  /**
   * Logs a URL budget entry to the log file
   * @param entry URL budget entry to log
   */
  private logUrlBudget(entry: UrlBudgetEntry): void {
    // Format is: urlId|clickCount|$budgetValue|timestamp
    // Where clickCount is either remaining clicks or required clicks based on isRemainingCount flag
    const clickCountType = entry.isRemainingCount ? "remaining" : "required";
    const logLine = `${entry.urlId}|${entry.clickCount}|$${entry.budgetValue.toFixed(2)}|${entry.timestamp}`;
    
    fs.appendFileSync(this.logFilePath, logLine + '\n');
    console.log(`📝 Logged URL budget: ${logLine} (${clickCountType} clicks)`);
  }
  
  /**
   * Gets the remaining clicks for a URL
   * @param url URL object
   * @returns Number of remaining clicks
   */
  private getRemainingClicks(url: Url): number {
    return Math.max(0, url.clickLimit - url.clicks);
  }
  
  /**
   * Tracks a URL budget and schedules an update if needed
   * @param url URL object
   * @param campaign Campaign object with price information
   * @param scheduleUpdate Whether to schedule a budget update
   * @param useFullClicks Whether to use full required clicks (true for new URLs) or remaining clicks (false for initial URLs in high-spend campaigns)
   */
  public trackUrlBudget(url: Url, campaign: Campaign, scheduleUpdate: boolean = true, useFullClicks: boolean = false): void {
    // Determine which click count to use based on the useFullClicks parameter
    // - For newly added URLs (useFullClicks=true), use the full clickLimit
    // - For initial URLs in high-spend campaigns (useFullClicks=false), use the remaining clicks
    
    let clickCount: number;
    const isRemainingCount: boolean = !useFullClicks;
    
    if (useFullClicks) {
      // Use the full required clicks (clickLimit)
      clickCount = url.clickLimit;
      console.log(`Using full required clicks (${clickCount}) for URL ${url.id}`);
    } else {
      // Use remaining clicks
      clickCount = this.getRemainingClicks(url);
      console.log(`Using remaining clicks (${clickCount}) for URL ${url.id}`);
    }
    
    // If no clicks to count, don't track
    if (clickCount <= 0) {
      console.log(`URL ${url.id} has no clicks to count, skipping budget tracking`);
      return;
    }
    
    // Get price per thousand from campaign
    const pricePerThousand = typeof campaign.pricePerThousand === 'string' 
      ? parseFloat(campaign.pricePerThousand) 
      : campaign.pricePerThousand || 0;
    
    // Calculate budget value
    const budgetValue = this.calculateBudgetValue(clickCount, pricePerThousand);
    
    // Create UTC timestamp
    const timestamp = this.formatUtcDateTime();
    
    // Create entry
    const entry: UrlBudgetEntry = {
      urlId: url.id,
      clickCount,
      isRemainingCount,
      budgetValue,
      timestamp,
      processed: false,
      campaignId: campaign.id
    };
    
    // Log entry
    this.logUrlBudget(entry);
    
    // Add to pending updates if needed
    if (scheduleUpdate && campaign.trafficstarCampaignId) {
      // Add to pending updates for the campaign
      if (!this.pendingUpdates.has(campaign.id)) {
        this.pendingUpdates.set(campaign.id, []);
      }
      this.pendingUpdates.get(campaign.id)?.push(entry);
      
      // Schedule update if not already scheduled
      this.scheduleUpdate(campaign);
    }
  }
  
  /**
   * Schedules a budget update for a campaign
   * @param campaign Campaign to update
   */
  private scheduleUpdate(campaign: Campaign): void {
    // Skip if no TrafficStar campaign ID
    if (!campaign.trafficstarCampaignId) {
      console.log(`Campaign ${campaign.id} has no TrafficStar campaign ID, skipping budget update`);
      return;
    }
    
    // Don't schedule a new update if one is already pending
    if (this.updateTimers.has(campaign.id)) {
      console.log(`Update already scheduled for campaign ${campaign.id}, not scheduling another`);
      return;
    }
    
    console.log(`⏱️ Scheduling budget update for campaign ${campaign.id} in 10 minutes`);
    
    // Schedule update in 10 minutes
    const timer = setTimeout(() => {
      this.processUpdate(campaign);
    }, 10 * 60 * 1000); // 10 minutes
    
    // Store timer reference
    this.updateTimers.set(campaign.id, timer);
  }
  
  /**
   * Processes a budget update for a campaign
   * @param campaign Campaign to update
   */
  private async processUpdate(campaign: Campaign): Promise<void> {
    try {
      // Clear timer reference
      this.updateTimers.delete(campaign.id);
      
      // Get pending updates for this campaign
      const entries = this.pendingUpdates.get(campaign.id) || [];
      if (entries.length === 0) {
        console.log(`No pending updates for campaign ${campaign.id}, skipping`);
        return;
      }
      
      console.log(`Processing ${entries.length} pending budget updates for campaign ${campaign.id}`);
      
      // Calculate total budget to add
      const totalBudget = entries.reduce((sum, entry) => sum + entry.budgetValue, 0);
      console.log(`Total budget to add: $${totalBudget.toFixed(2)}`);
      
      // Get current campaign info from TrafficStar
      if (!campaign.trafficstarCampaignId) {
        console.log(`Campaign ${campaign.id} has no TrafficStar campaign ID, skipping update`);
        return;
      }
      
      const tsId = Number(campaign.trafficstarCampaignId);
      const tsCampaign = await trafficStarService.getCampaign(tsId);
      
      if (!tsCampaign) {
        console.log(`Failed to get TrafficStar campaign ${tsId}, skipping update`);
        return;
      }
      
      // Get current budget
      const currentBudget = typeof tsCampaign.max_daily === 'number' 
        ? tsCampaign.max_daily 
        : parseFloat(tsCampaign.max_daily);
      
      // Calculate new budget
      const newBudget = currentBudget + totalBudget;
      console.log(`Updating TrafficStar campaign ${tsId} budget from $${currentBudget.toFixed(2)} to $${newBudget.toFixed(2)}`);
      
      // Update TrafficStar campaign budget
      await trafficStarService.updateCampaignBudget(tsId, newBudget);
      
      // Set today's end time to 23:59 UTC
      const today = new Date();
      const endTime = `${today.toISOString().split('T')[0]} 23:59:59`;
      await trafficStarService.updateCampaignEndTime(tsId, endTime);
      
      // Activate campaign if not already active
      const status = await trafficStarService.getCampaignStatus(tsId);
      if (status && !status.active) {
        await trafficStarService.activateCampaign(tsId);
        console.log(`✅ Activated TrafficStar campaign ${tsId}`);
      }
      
      // Mark all entries as processed
      entries.forEach(entry => {
        entry.processed = true;
      });
      
      // Clear pending updates for this campaign
      this.pendingUpdates.delete(campaign.id);
      
      console.log(`✅ Successfully processed budget update for campaign ${campaign.id}`);
    } catch (error) {
      console.error(`Error processing budget update for campaign ${campaign.id}:`, error);
    }
  }
  
  /**
   * Tracks budgets for all active URLs in a campaign
   * @param campaignId Campaign ID to track
   */
  public async trackCampaignUrlBudgets(campaignId: number): Promise<void> {
    try {
      // Get campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId));
      
      if (!campaign) {
        console.log(`Campaign ${campaignId} not found, skipping budget tracking`);
        return;
      }
      
      if (!campaign.trafficstarCampaignId) {
        console.log(`Campaign ${campaignId} has no TrafficStar campaign ID, skipping budget tracking`);
        return;
      }
      
      // Get all active URLs for this campaign
      const activeUrls = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaignId),
            eq(urls.status, 'active')
          )
        );
      
      console.log(`Found ${activeUrls.length} active URLs for campaign ${campaignId}`);
      
      // Determine if we should schedule an update
      // Only schedule one update for the entire campaign, not per URL
      const shouldScheduleUpdate = activeUrls.length > 0;
      
      // Track budget for each URL - for initial tracking, use remaining clicks
      for (const url of activeUrls) {
        // Don't schedule individual updates, we'll do one for the campaign
        // Use remaining clicks (useFullClicks=false) for initial campaign tracking
        this.trackUrlBudget(url, campaign, false, false);
      }
      
      // Now schedule a single update for the campaign if needed
      if (shouldScheduleUpdate) {
        this.scheduleUpdate(campaign);
      }
      
    } catch (error) {
      console.error(`Error tracking campaign URL budgets:`, error);
    }
  }
  
  /**
   * Tracks budget for a newly added URL and schedules an update
   * @param urlId URL ID to track
   */
  public async trackNewUrlBudget(urlId: number): Promise<void> {
    try {
      // Get URL
      const [url] = await db
        .select()
        .from(urls)
        .where(eq(urls.id, urlId));
      
      if (!url) {
        console.log(`URL ${urlId} not found, skipping budget tracking`);
        return;
      }
      
      if (url.status !== 'active') {
        console.log(`URL ${urlId} is not active (status: ${url.status}), skipping budget tracking`);
        return;
      }
      
      if (!url.campaignId) {
        console.log(`URL ${urlId} has no campaign ID, skipping budget tracking`);
        return;
      }
      
      // Get campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, url.campaignId));
      
      if (!campaign) {
        console.log(`Campaign ${url.campaignId} not found, skipping budget tracking`);
        return;
      }
      
      if (!campaign.trafficstarCampaignId) {
        console.log(`Campaign ${url.campaignId} has no TrafficStar campaign ID, skipping budget tracking`);
        return;
      }
      
      // For newly added URLs, we use the FULL required clicks (useFullClicks=true)
      // This is especially important for campaigns that already have $10+ spent
      console.log(`Tracking new URL ${urlId} with FULL required clicks for budget calculation`);
      this.trackUrlBudget(url, campaign, true, true);
      
    } catch (error) {
      console.error(`Error tracking new URL budget:`, error);
    }
  }
}

// Export singleton instance
export const urlBudgetTracker = new UrlBudgetTracker();