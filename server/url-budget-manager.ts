import { db } from './db';
import urlBudgetLogger from './url-budget-logger';
import { trafficStarService } from './trafficstar-service';

/**
 * Class that manages URL budget updates after the initial high-spend calculation
 * Handles URLs added after the campaign has already gone over $10 spent
 */
export class UrlBudgetManager {
  private static instance: UrlBudgetManager;
  // Map of campaign IDs to pending URL updates and their timers
  private pendingUpdates: Map<number, {
    campaignId: number,
    trafficstarCampaignId: string,
    pendingUrls: Map<number, { urlId: number, budget: number }>,
    timerHandle: NodeJS.Timeout | null,
    timestamp: number
  }> = new Map();
  
  // 9-minute waiting period in milliseconds
  private readonly BUDGET_UPDATE_WAIT_MS = 9 * 60 * 1000;
  
  private constructor() {
    console.log('URL Budget Manager initialized');
  }

  /**
   * Get singleton instance of the manager
   */
  public static getInstance(): UrlBudgetManager {
    if (!UrlBudgetManager.instance) {
      UrlBudgetManager.instance = new UrlBudgetManager();
    }
    return UrlBudgetManager.instance;
  }

  /**
   * Track a new URL for budget update
   * This is called when a new URL is added to a campaign after the initial budget calculation (when spent > $10)
   * 
   * @param campaignId Database ID of the campaign
   * @param trafficstarCampaignId TrafficStar ID of the campaign
   * @param urlId URL ID to track
   * @param clickLimit The click limit for the URL (total required clicks)
   * @param pricePerThousand Price per thousand clicks
   * @returns true if the URL was added for tracking, false if it's already being tracked
   */
  public async trackNewUrlForBudgetUpdate(
    campaignId: number,
    trafficstarCampaignId: string,
    urlId: number,
    clickLimit: number,
    pricePerThousand: number
  ): Promise<boolean> {
    // Check if this URL has already been logged
    if (urlBudgetLogger.isUrlLogged(urlId, campaignId)) {
      console.log(`📋 URL ${urlId} has already been logged for budget calculation - skipping`);
      return false;
    }

    // Calculate budget based on total required clicks (not remaining clicks)
    const urlBudget = (clickLimit / 1000) * pricePerThousand;
    console.log(`💰 New URL ${urlId} budget calculation: ${clickLimit} clicks at $${pricePerThousand} per 1,000 = $${urlBudget.toFixed(4)}`);
    
    // Log this URL's budget
    await urlBudgetLogger.logUrlBudget(urlId, urlBudget, campaignId, new Date());
    
    // Get or create an entry for this campaign
    let campaignEntry = this.pendingUpdates.get(campaignId);
    
    if (!campaignEntry) {
      // First URL added after initial budget calculation - create new entry and start timer
      campaignEntry = {
        campaignId,
        trafficstarCampaignId,
        pendingUrls: new Map(),
        timerHandle: null,
        timestamp: Date.now()
      };
      
      this.pendingUpdates.set(campaignId, campaignEntry);
      
      // Start the 9-minute timer
      console.log(`⏱️ Starting 9-minute timer for campaign ${campaignId} budget update`);
      campaignEntry.timerHandle = setTimeout(() => {
        this.processBudgetUpdate(campaignId);
      }, this.BUDGET_UPDATE_WAIT_MS);
    }
    
    // Add this URL to the pending updates
    campaignEntry.pendingUrls.set(urlId, { urlId, budget: urlBudget });
    
    console.log(`📝 Added URL ${urlId} to pending budget updates for campaign ${campaignId} - $${urlBudget.toFixed(4)}`);
    console.log(`📊 Campaign ${campaignId} now has ${campaignEntry.pendingUrls.size} pending URL budget updates`);
    
    return true;
  }

  /**
   * Process the budget update for a campaign after the waiting period
   * @param campaignId Campaign ID
   */
  private async processBudgetUpdate(campaignId: number): Promise<void> {
    const campaignEntry = this.pendingUpdates.get(campaignId);
    
    if (!campaignEntry) {
      console.log(`⚠️ No pending updates found for campaign ${campaignId} - skipping budget update`);
      return;
    }
    
    try {
      console.log(`⏰ 9-minute timer elapsed for campaign ${campaignId} - processing budget update`);
      
      // Calculate total pending budget
      let totalPendingBudget = 0;
      // Convert to array for compatibility with older JS versions
      const pendingUrlEntries = Array.from(campaignEntry.pendingUrls.entries());
      
      pendingUrlEntries.forEach(([urlId, urlData]) => {
        totalPendingBudget += urlData.budget;
        console.log(`📊 Including $${urlData.budget.toFixed(4)} from URL ${urlId} in budget update`);
      });
      
      console.log(`📊 Total pending budget to add: $${totalPendingBudget.toFixed(4)}`);
      
      if (totalPendingBudget <= 0) {
        console.log(`⚠️ No budget to add for campaign ${campaignId} - skipping update`);
        // Clean up
        this.pendingUpdates.delete(campaignId);
        return;
      }
      
      // Get the current TrafficStar campaign budget
      const trafficstarCampaignId = campaignEntry.trafficstarCampaignId;
      
      try {
        // Fetch campaign details and prepare end time in parallel for performance improvement
        const campaignDetailsPromise = trafficStarService.getCampaign(Number(trafficstarCampaignId));
        
        // Prepare end time data while waiting for API response
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const endTimeStr = `${todayStr} 23:59:00`;
        
        // Wait for campaign details
        const campaignDetails = await campaignDetailsPromise;
        
        if (!campaignDetails) {
          throw new Error(`Failed to get campaign details for ${trafficstarCampaignId}`);
        }
        
        // Extract current budget
        const currentBudget = campaignDetails.total_budget;
        
        if (typeof currentBudget !== 'number') {
          throw new Error(`Invalid budget format for campaign ${trafficstarCampaignId}: ${currentBudget}`);
        }
        
        console.log(`💰 Current budget for campaign ${trafficstarCampaignId}: $${currentBudget.toFixed(4)}`);
        
        // Calculate new budget
        const newBudget = currentBudget + totalPendingBudget;
        console.log(`💰 New budget calculation: $${currentBudget.toFixed(4)} + $${totalPendingBudget.toFixed(4)} = $${newBudget.toFixed(4)}`);
        
        // Execute budget update and end time update in parallel
        await Promise.all([
          trafficStarService.updateCampaignBudget(Number(trafficstarCampaignId), newBudget),
          trafficStarService.updateCampaignEndTime(Number(trafficstarCampaignId), endTimeStr)
        ]);
        
        console.log(`✅ Updated campaign ${trafficstarCampaignId} budget to $${newBudget.toFixed(4)}`);
        console.log(`✅ Set campaign ${trafficstarCampaignId} end time to ${endTimeStr}`);
        console.log(`✅ Set campaign ${trafficstarCampaignId} end time to ${endTimeStr}`);
        
        // Make sure campaign is active
        const statusResult = await trafficStarService.getCampaignStatus(Number(trafficstarCampaignId));
        if (!statusResult.active || statusResult.status !== 'enabled') {
          // Activate the campaign if it's not already active
          await trafficStarService.activateCampaign(Number(trafficstarCampaignId));
          console.log(`✅ Activated campaign ${trafficstarCampaignId} after budget update`);
        } else {
          console.log(`✅ Campaign ${trafficstarCampaignId} is already active - no need to activate`);
        }
        
        console.log(`✅ Successfully processed budget update for campaign ${campaignId} with ${campaignEntry.pendingUrls.size} new URLs`);
      } catch (error) {
        console.error(`❌ Error updating budget for campaign ${campaignId}:`, error);
      }
    } catch (error) {
      console.error(`❌ Error processing budget update for campaign ${campaignId}:`, error);
    } finally {
      // Clean up
      if (campaignEntry.timerHandle) {
        clearTimeout(campaignEntry.timerHandle);
      }
      this.pendingUpdates.delete(campaignId);
    }
  }

  /**
   * Cancel any pending budget updates for a campaign
   * Should be called when campaign spent value drops below threshold ($10)
   * @param campaignId Campaign ID
   */
  public cancelPendingUpdates(campaignId: number): void {
    const campaignEntry = this.pendingUpdates.get(campaignId);
    
    if (campaignEntry) {
      console.log(`❌ Cancelling pending budget update for campaign ${campaignId} (${campaignEntry.pendingUrls.size} URLs)`);
      
      if (campaignEntry.timerHandle) {
        clearTimeout(campaignEntry.timerHandle);
      }
      
      this.pendingUpdates.delete(campaignId);
    }
  }

  /**
   * Check if a campaign has pending budget updates
   * @param campaignId Campaign ID
   * @returns true if the campaign has pending updates, false otherwise
   */
  public hasPendingUpdates(campaignId: number): boolean {
    return this.pendingUpdates.has(campaignId);
  }

  /**
   * Get the number of pending URL budget updates for a campaign
   * @param campaignId Campaign ID
   * @returns Number of pending URL budget updates
   */
  public getPendingUpdateCount(campaignId: number): number {
    const campaignEntry = this.pendingUpdates.get(campaignId);
    return campaignEntry ? campaignEntry.pendingUrls.size : 0;
  }
  
  /**
   * Process pending updates for a campaign immediately, without waiting for the timer
   * This is primarily used for testing
   * @param campaignId Campaign ID
   * @returns True if processed successfully, false otherwise
   */
  public async processImmediately(campaignId: number): Promise<boolean> {
    try {
      const campaignEntry = this.pendingUpdates.get(campaignId);
      
      if (!campaignEntry) {
        console.log(`⚠️ No pending updates found for campaign ${campaignId}`);
        return false;
      }
      
      console.log(`🚀 Immediately processing ${campaignEntry.pendingUrls.size} pending URL budget updates for campaign ${campaignId}`);
      
      // Clear any existing timer
      if (campaignEntry.timerHandle) {
        clearTimeout(campaignEntry.timerHandle);
        campaignEntry.timerHandle = null;
      }
      
      // Process the budget update now
      await this.processBudgetUpdate(campaignId);
      
      return true;
    } catch (error) {
      console.error(`❌ Error processing immediate budget update for campaign ${campaignId}:`, error);
      return false;
    }
  }
}

// Export a singleton instance
const urlBudgetManager = UrlBudgetManager.getInstance();
export default urlBudgetManager;