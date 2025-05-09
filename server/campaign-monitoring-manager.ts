/**
 * Campaign Monitoring Manager
 * 
 * This file handles the monitoring status tracking for campaigns in a centralized way.
 * It replaces the previous implementation of individual interval timers with a central monitoring table.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from './db';
import { campaignMonitoring, type CampaignMonitoring } from '@shared/schema';

/**
 * Campaign Monitoring Manager
 * 
 * Manages campaign monitoring state in the database instead of using intervals
 */
class CampaignMonitoringManager {
  /**
   * Add a campaign to monitoring
   * 
   * @param campaignId - The ID of the campaign to monitor
   * @param trafficstarCampaignId - The TrafficStar campaign ID
   * @param type - The type of monitoring ('active_status', 'pause_status', 'empty_url')
   */
  async addCampaignToMonitoring(
    campaignId: number, 
    trafficstarCampaignId: string, 
    type: 'active_status' | 'pause_status' | 'empty_url'
  ): Promise<void> {
    console.log(`🔄 Adding campaign ${campaignId} to monitoring with type: ${type}`);
    
    try {
      // First check if the entry already exists
      const existingEntry = await db.select()
        .from(campaignMonitoring)
        .where(
          and(
            eq(campaignMonitoring.campaignId, campaignId),
            eq(campaignMonitoring.type, type)
          )
        )
        .limit(1);
      
      if (existingEntry.length > 0) {
        // Update existing entry
        await db.update(campaignMonitoring)
          .set({
            isActive: true,
            trafficstarCampaignId, // Update the TrafficStar ID in case it changed
            updatedAt: new Date()
          })
          .where(
            and(
              eq(campaignMonitoring.campaignId, campaignId),
              eq(campaignMonitoring.type, type)
            )
          );
      } else {
        // Insert new entry
        await db.insert(campaignMonitoring)
          .values({
            campaignId,
            trafficstarCampaignId,
            type,
            isActive: true,
            addedAt: new Date(),
            updatedAt: new Date()
          });
      }
        
      console.log(`✅ Successfully added campaign ${campaignId} to ${type} monitoring`);
    } catch (error) {
      console.error(`❌ Error adding campaign ${campaignId} to monitoring:`, error);
      throw error;
    }
  }
  
  /**
   * Remove a campaign from monitoring
   * 
   * @param campaignId - The ID of the campaign to stop monitoring
   * @param type - The type of monitoring to remove
   */
  async removeCampaignFromMonitoring(
    campaignId: number, 
    type: 'active_status' | 'pause_status' | 'empty_url'
  ): Promise<void> {
    console.log(`🔄 Removing campaign ${campaignId} from ${type} monitoring`);
    
    try {
      await db.update(campaignMonitoring)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(campaignMonitoring.campaignId, campaignId),
            eq(campaignMonitoring.type, type)
          )
        );
        
      console.log(`✅ Successfully removed campaign ${campaignId} from ${type} monitoring`);
    } catch (error) {
      console.error(`❌ Error removing campaign ${campaignId} from monitoring:`, error);
      throw error;
    }
  }
  
  /**
   * Get all campaigns that should be monitored
   * 
   * @returns Array of campaign monitoring entries that are active
   */
  async getActiveCampaignMonitoring(): Promise<CampaignMonitoring[]> {
    try {
      const monitoringEntries = await db.select()
        .from(campaignMonitoring)
        .where(
          eq(campaignMonitoring.isActive, true)
        );
        
      return monitoringEntries;
    } catch (error) {
      console.error('❌ Error getting active campaign monitoring entries:', error);
      return [];
    }
  }
  
  /**
   * Get all campaigns that should be monitored for a specific type
   * 
   * @param type - The type of monitoring to filter by
   * @returns Array of campaign monitoring entries of the specified type
   */
  async getActiveCampaignMonitoringByType(
    type: 'active_status' | 'pause_status' | 'empty_url'
  ): Promise<CampaignMonitoring[]> {
    try {
      const monitoringEntries = await db.select()
        .from(campaignMonitoring)
        .where(
          and(
            eq(campaignMonitoring.isActive, true),
            eq(campaignMonitoring.type, type)
          )
        );
        
      return monitoringEntries;
    } catch (error) {
      console.error(`❌ Error getting active campaign monitoring entries for type ${type}:`, error);
      return [];
    }
  }
  
  /**
   * Check if a campaign is being monitored for a specific type
   * 
   * @param campaignId - The ID of the campaign to check
   * @param type - The type of monitoring to check for
   * @returns Boolean indicating if the campaign is being monitored
   */
  async isCampaignMonitored(
    campaignId: number, 
    type: 'active_status' | 'pause_status' | 'empty_url'
  ): Promise<boolean> {
    try {
      const monitoringEntry = await db.select({
        id: campaignMonitoring.id,
        isActive: campaignMonitoring.isActive
      })
        .from(campaignMonitoring)
        .where(
          and(
            eq(campaignMonitoring.campaignId, campaignId),
            eq(campaignMonitoring.type, type),
            eq(campaignMonitoring.isActive, true)
          )
        )
        .limit(1);
        
      return monitoringEntry.length > 0;
    } catch (error) {
      console.error(`❌ Error checking if campaign ${campaignId} is monitored for type ${type}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const campaignMonitoringManager = new CampaignMonitoringManager();
export default campaignMonitoringManager;