import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { FileHandle } from 'fs/promises';
import { db } from './db';
import { urls, campaigns } from '@shared/schema';
import { eq, and, ne, isNull } from 'drizzle-orm';

/**
 * Class for logging URL budget calculations
 * Logs are saved in format: UrlId|CampaignId|UrlName|Price|Date::Time in HH:MM:SEC[current UTC+00 TIME]
 * Logs are campaign-specific and only created for campaigns with TrafficStar integration
 */
export class UrlBudgetLogger {
  private static instance: UrlBudgetLogger;
  private logDirectory: string;
  
  // Map to track URLs that have been logged by campaign ID
  // Key: campaignId, Value: Set of urlIds that have been logged
  private loggedUrlsByCampaign: Map<number, Set<number>> = new Map();

  private constructor() {
    // Set the log directory path to the root directory
    this.logDirectory = path.join('.', 'url_budget_logs');
    this.ensureLogDirectoryExists();
    
    // Create the symbolic link or directory for Active_Url_Budget_Logs
    const activeLogs = path.join('.', 'Active_Url_Budget_Logs');
    if (!fs.existsSync(activeLogs)) {
      try {
        // Create a directory instead of a symlink
        fs.mkdirSync(activeLogs, { recursive: true });
        console.log(`Created Active_Url_Budget_Logs directory for easier access`);
      } catch (error) {
        console.error(`Failed to create Active_Url_Budget_Logs directory: ${error}`);
      }
    }
  }

  /**
   * Get singleton instance of the logger
   */
  public static getInstance(): UrlBudgetLogger {
    if (!UrlBudgetLogger.instance) {
      UrlBudgetLogger.instance = new UrlBudgetLogger();
    }
    return UrlBudgetLogger.instance;
  }

  /**
   * Ensure the log directory exists, create if not
   */
  private ensureLogDirectoryExists(): void {
    if (!fs.existsSync(this.logDirectory)) {
      try {
        fs.mkdirSync(this.logDirectory, { recursive: true });
        console.log(`Created URL budget logs directory at ${this.logDirectory}`);
      } catch (error) {
        console.error(`Failed to create URL budget logs directory: ${error}`);
      }
    }
  }

  /**
   * Get the log file path for a specific campaign
   * @param campaignId Campaign ID
   * @returns Path to the log file
   */
  private getLogFilePath(campaignId: number): string {
    return path.join(this.logDirectory, `campaign_${campaignId}_url_budget_logs`);
  }

  /**
   * Ensure a campaign-specific log file exists
   * @param campaignId Campaign ID
   */
  private ensureCampaignLogFileExists(campaignId: number): void {
    const logFilePath = this.getLogFilePath(campaignId);
    
    if (!fs.existsSync(logFilePath)) {
      try {
        fs.writeFileSync(logFilePath, '');
        console.log(`Created URL budget log file for campaign ${campaignId} at ${logFilePath}`);
      } catch (error) {
        console.error(`Failed to create URL budget log file for campaign ${campaignId}: ${error}`);
      }
    }
  }

  /**
   * Initialize tracking for a campaign
   * @param campaignId Campaign ID
   */
  private initCampaignTracking(campaignId: number): void {
    // Create log file if it doesn't exist
    this.ensureCampaignLogFileExists(campaignId);
    
    // Initialize tracking set if it doesn't exist
    if (!this.loggedUrlsByCampaign.has(campaignId)) {
      this.loggedUrlsByCampaign.set(campaignId, new Set<number>());
    }
  }

  /**
   * Get the active logs file path
   * @returns Path to the active log file
   */
  private getActiveLogFilePath(): string {
    return path.join('.', 'Active_Url_Budget_Logs', 'Active_Url_Budget_Logs');
  }

  /**
   * Log a URL budget calculation if it hasn't been logged in the current high-spend cycle for this campaign
   * @param campaignId Campaign ID
   * @param urlId URL ID
   * @param urlName URL name/identifier
   * @param price Price calculated for remaining clicks
   * @returns boolean indicating if the URL was logged (true) or skipped because it was already logged (false)
   */
  public async logUrlBudget(campaignId: number, urlId: number, urlName: string, price: number): Promise<boolean> {
    // First, check if this campaign has TrafficStar integration
    const hasTrafficStar = await this.hasCampaignTrafficStarIntegration(campaignId);
    if (!hasTrafficStar) {
      console.log(`⚠️ Skipping URL budget log for URL ID ${urlId} - Campaign ${campaignId} has no TrafficStar integration`);
      return false;
    }
    
    // Check if the URL is active and belongs to this campaign
    const isValidUrl = await this.isUrlActiveForCampaign(urlId, campaignId);
    if (!isValidUrl) {
      console.log(`⚠️ Skipping URL budget log for URL ID ${urlId} - URL is not active for campaign ${campaignId}`);
      return false;
    }
    
    // Initialize tracking for this campaign if needed
    this.initCampaignTracking(campaignId);
    
    // Get tracking set for this campaign
    const loggedUrls = this.loggedUrlsByCampaign.get(campaignId);
    
    // Skip if this URL has already been logged for this campaign
    if (loggedUrls?.has(urlId)) {
      console.log(`🔄 Skipping duplicate URL budget log for URL ID ${urlId} in campaign ${campaignId} - already logged in this high-spend cycle`);
      return false;
    }

    try {
      // Format date and time
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
      
      // Format the log entry in requested format: UrlId|Price|Date::Time
      const logEntryFormat1 = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;
      
      // Format the log entry with campaign info: UrlId|CampaignId|UrlName|Price|Date::Time
      const logEntryFormat2 = `${urlId}|${campaignId}|${urlName}|${price.toFixed(4)}|${date}::${time}\n`;
      
      // Get the log file paths
      const campaignLogPath = this.getLogFilePath(campaignId);
      const activeLogPath = this.getActiveLogFilePath();

      // Make sure the active log file exists
      if (!fs.existsSync(activeLogPath)) {
        await fsPromises.writeFile(activeLogPath, '');
      }

      // Append to campaign-specific log file with full information
      await fsPromises.appendFile(campaignLogPath, logEntryFormat2);
      
      // Append to active log file with simplified format
      await fsPromises.appendFile(activeLogPath, logEntryFormat1);
      
      console.log(`📝 Logged URL budget for URL ID ${urlId} in campaign ${campaignId}: $${price.toFixed(4)} at ${date}::${time}`);
      
      // Add to set of logged URLs for this campaign
      loggedUrls?.add(urlId);
      return true;
    } catch (error) {
      console.error(`❌ Failed to log URL budget for campaign ${campaignId}: ${error}`);
      return false;
    }
  }
  
  /**
   * Check if a URL is active and belongs to the specified campaign
   * @param urlId URL ID to check
   * @param campaignId Campaign ID to check
   * @returns true if the URL is active and belongs to the campaign, false otherwise
   */
  private async isUrlActiveForCampaign(urlId: number, campaignId: number): Promise<boolean> {
    try {
      const url = await db.query.urls.findFirst({
        where: (url, { eq, and }) => 
          and(
            eq(url.id, urlId),
            eq(url.campaignId, campaignId),
            eq(url.status, 'active')
          )
      });
      
      return !!url;
    } catch (error) {
      console.error(`❌ Failed to check if URL ${urlId} is active for campaign ${campaignId}: ${error}`);
      return false;
    }
  }

  /**
   * Check if a URL has already been logged in the current high-spend cycle for a specific campaign
   * @param campaignId Campaign ID
   * @param urlId URL ID to check
   * @returns true if the URL has been logged for this campaign, false otherwise
   */
  public isUrlLogged(campaignId: number, urlId: number): boolean {
    const loggedUrls = this.loggedUrlsByCampaign.get(campaignId);
    return loggedUrls?.has(urlId) || false;
  }

  /**
   * Clear URL budget logs for a specific campaign and reset its tracking set
   * Should be called when campaign spent value drops below $10
   * @param campaignId Campaign ID
   */
  public async clearCampaignLogs(campaignId: number): Promise<void> {
    try {
      // Get the log file path for this campaign
      const logFilePath = this.getLogFilePath(campaignId);
      
      // Check if the file exists before attempting to clear it
      if (fs.existsSync(logFilePath)) {
        // Clear the log file by writing an empty string
        await fsPromises.writeFile(logFilePath, '');
      }
      
      // Get the active log file path
      const activeLogPath = this.getActiveLogFilePath();
      
      // If active log exists, we need to rebuild it from all other campaigns except this one
      if (fs.existsSync(activeLogPath)) {
        try {
          // Clear the active log file first
          await fsPromises.writeFile(activeLogPath, '');
          
          // Get all campaigns with TrafficStar integration except the one being cleared
          const otherCampaigns = await db.query.campaigns.findMany({
            where: (c, { eq, and, ne, not, isNull }) => 
              and(
                ne(c.id, campaignId), // Not the campaign being cleared
                ne(c.trafficstarCampaignId, ''),
                not(isNull(c.trafficstarCampaignId))
              )
          });
          
          // Rebuild the active log from other campaign logs
          for (const campaign of otherCampaigns) {
            const campaignLogPath = this.getLogFilePath(campaign.id);
            if (fs.existsSync(campaignLogPath)) {
              // Read the campaign log file
              const fileContent = await fsPromises.readFile(campaignLogPath, 'utf-8');
              const lines = fileContent.split('\n').filter(line => line.trim() !== '');
              
              // Convert each line to the simplified format and append to active log
              for (const line of lines) {
                const [urlId, _campaignId, _urlName, price, dateTime] = line.split('|');
                // Format the line in requested format: UrlId|Price|Date::Time
                const simplifiedLine = `${urlId}|${price}|${dateTime}\n`;
                await fsPromises.appendFile(activeLogPath, simplifiedLine);
              }
            }
          }
          
          console.log(`✅ Rebuilt active log after clearing campaign ${campaignId}`);
        } catch (rebuildError) {
          console.error(`❌ Failed to rebuild active log: ${rebuildError}`);
        }
      }
      
      // Clear the set of logged URLs for this campaign
      this.loggedUrlsByCampaign.set(campaignId, new Set<number>());
      
      console.log(`🧹 Cleared URL budget logs for campaign ${campaignId} - spent value dropped below threshold`);
    } catch (error) {
      console.error(`❌ Failed to clear URL budget logs for campaign ${campaignId}: ${error}`);
    }
  }

  /**
   * Get all URL budget logs for a specific campaign
   * @param campaignId Campaign ID
   * @returns Array of log entries
   */
  public async getCampaignUrlBudgetLogs(campaignId: number): Promise<Array<{urlId: number, campaignId: number, urlName: string, price: string, dateTime: string}>> {
    try {
      // Get the log file path for this campaign
      const logFilePath = this.getLogFilePath(campaignId);
      
      // Check if the file exists
      if (!fs.existsSync(logFilePath)) {
        return [];
      }
      
      // Read the log file
      const fileContent = await fsPromises.readFile(logFilePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');
      
      // Parse each line
      return lines.map(line => {
        const [urlId, cId, urlName, price, dateTime] = line.split('|');
        return {
          urlId: parseInt(urlId, 10),
          campaignId: parseInt(cId, 10),
          urlName: urlName,
          price: price,
          dateTime: dateTime
        };
      });
    } catch (error) {
      console.error(`❌ Failed to get URL budget logs for campaign ${campaignId}: ${error}`);
      return [];
    }
  }
  
  /**
   * Get all URL budget logs across all campaigns
   * @returns Array of log entries
   */
  public async getAllUrlBudgetLogs(): Promise<Array<{urlId: number, campaignId: number, urlName: string, price: string, dateTime: string}>> {
    try {
      // Get all campaigns with TrafficStar integration
      const campaignsWithTrafficStar = await db.query.campaigns.findMany({
        where: (c, { eq, and, ne, not, isNull }) => 
          and(
            ne(c.trafficstarCampaignId, ''),
            not(isNull(c.trafficstarCampaignId))
          )
      });
        
      // Combine logs from all campaigns
      let allLogs: Array<{urlId: number, campaignId: number, urlName: string, price: string, dateTime: string}> = [];
      
      for (const campaign of campaignsWithTrafficStar) {
        const campaignLogs = await this.getCampaignUrlBudgetLogs(campaign.id);
        allLogs = [...allLogs, ...campaignLogs];
      }
      
      return allLogs;
    } catch (error) {
      console.error(`❌ Failed to get all URL budget logs: ${error}`);
      return [];
    }
  }
  
  /**
   * Get active URLs for a campaign that are eligible for budget logging
   * Only returns URLs that:
   * 1. Are active (not deleted/paused)
   * 2. Belong to the specified campaign
   * 3. Have remaining clicks
   * 
   * @param campaignId Campaign ID
   * @returns Array of active URLs with campaign ID and remaining clicks
   */
  public async getActiveUrlsForCampaign(campaignId: number): Promise<Array<{id: number, name: string, clickLimit: number, clicks: number, remainingClicks: number}>> {
    try {
      const activeUrls = await db.query.urls.findMany({
        where: (url, { eq, and }) => 
          and(
            eq(url.campaignId, campaignId),
            eq(url.status, 'active')
          ),
        columns: {
          id: true,
          name: true,
          clickLimit: true,
          clicks: true,
        }
      });
      
      // Calculate remaining clicks and filter out any with 0 remaining
      return activeUrls
        .map(url => ({
          ...url,
          remainingClicks: url.clickLimit - url.clicks
        }))
        .filter(url => url.remainingClicks > 0);
        
    } catch (error) {
      console.error(`❌ Failed to get active URLs for campaign ${campaignId}: ${error}`);
      return [];
    }
  }
  
  /**
   * Check if a campaign has TrafficStar integration
   * @param campaignId Campaign ID
   * @returns true if the campaign has a TrafficStar campaign ID, false otherwise
   */
  public async hasCampaignTrafficStarIntegration(campaignId: number): Promise<boolean> {
    try {
      const campaign = await db.query.campaigns.findFirst({
        where: (c, { eq }) => eq(c.id, campaignId),
        columns: { trafficstarCampaignId: true }
      });
      
      return !!campaign && 
             !!campaign.trafficstarCampaignId && 
             campaign.trafficstarCampaignId !== '';
    } catch (error) {
      console.error(`❌ Failed to check TrafficStar integration for campaign ${campaignId}: ${error}`);
      return false;
    }
  }
}

// Export a singleton instance
const urlBudgetLogger = UrlBudgetLogger.getInstance();
export default urlBudgetLogger;