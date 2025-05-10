import { db, pool } from './db';
import { campaigns, urls } from '@shared/schema';
import { trafficStarService } from './trafficstar-service';
import urlBudgetLogger from './url-budget-logger';

/**
 * High Spend Budget Diagnosis Tool
 * 
 * This tool helps diagnose issues with the high spend budget calculation flow
 * without modifying existing code. It provides:
 * 
 * 1. Diagnostic checks to identify potential issues
 * 2. Detailed logging of the high spend process
 * 3. Emergency recovery functions for stuck campaigns
 */
class HighSpendDiagnosis {
  private BUDGET_THRESHOLD = 10; // $10 threshold
  
  constructor() {
    console.log('High Spend Diagnosis Tool initialized');
  }
  
  /**
   * Check and log the current status of high spend processing for a campaign
   * @param campaignId Campaign ID to diagnose
   */
  public async diagnoseHighSpendStatus(campaignId: number): Promise<any> {
    try {
      console.log(`\n===== DIAGNOSING HIGH SPEND FLOW FOR CAMPAIGN ${campaignId} =====`);
      
      // 1. Get campaign details using standard PostgreSQL query
      const campaignResult = await pool.query(`
        SELECT c.* 
        FROM campaigns c
        WHERE c.id = $1
      `, [campaignId]);
      
      const campaign = campaignResult.rows[0];
      
      // Get active URLs for this campaign
      const urlsResult = await pool.query(`
        SELECT u.* 
        FROM urls u
        WHERE u.campaign_id = $1 AND u.status = 'active'
      `, [campaignId]);
      
      // Add URLs to campaign object
      campaign.urls = urlsResult.rows;
      
      if (!campaign) {
        console.log(`❌ Campaign ${campaignId} not found`);
        return { success: false, message: 'Campaign not found' };
      }
      
      const result = {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          trafficstarCampaignId: campaign.trafficstarCampaignId,
          dailySpent: campaign.dailySpent,
          lastTrafficSenderStatus: campaign.lastTrafficSenderStatus,
          lastTrafficSenderAction: campaign.lastTrafficSenderAction,
          highSpendBudgetCalcTime: campaign.highSpendBudgetCalcTime,
          highSpendWaitMinutes: campaign.highSpendWaitMinutes || 11,
        },
        flowStatus: '',
        isHighSpend: false,
        activeUrls: campaign.urls.length,
        totalRemainingClicks: 0,
        errors: [],
        warnings: [],
        recommendations: []
      };
      
      // 2. Calculate total remaining clicks
      let totalRemainingClicks = 0;
      campaign.urls.forEach(url => {
        const remainingClicks = url.clickLimit - url.clicks;
        if (remainingClicks > 0) {
          totalRemainingClicks += remainingClicks;
        }
      });
      
      result.totalRemainingClicks = totalRemainingClicks;
      
      // 3. Check if this is a high spend situation
      const spentValue = parseFloat(campaign.dailySpent || '0');
      result.isHighSpend = spentValue >= this.BUDGET_THRESHOLD;
      
      // 4. Check TrafficStar real status
      let trafficStarStatus = null;
      if (campaign.trafficstarCampaignId) {
        try {
          const tsDetails = await trafficStarService.getCampaignDetails(Number(campaign.trafficstarCampaignId));
          trafficStarStatus = {
            active: tsDetails.active,
            status: tsDetails.active ? 'enabled' : 'paused',
            dailyBudget: tsDetails.daily_limit
          };
          
          // Add warning if status doesn't match expectation
          if (result.isHighSpend && tsDetails.active) {
            result.warnings.push('Campaign is in high spend state but TrafficStar campaign is still active');
          }
        } catch (error) {
          result.errors.push(`Failed to get TrafficStar status: ${error}`);
        }
      } else {
        result.warnings.push('Campaign has no TrafficStar ID');
      }
      
      // 5. Check logged URLs
      const urlBudgetLogs = await urlBudgetLogger.getInstance().getCampaignUrlBudgetLogs(campaignId);
      
      // 6. Determine flow stage and issues
      if (!result.isHighSpend) {
        result.flowStatus = 'low_spend';
        if (urlBudgetLogs.length > 0) {
          result.warnings.push('Campaign has URL budget logs but is in low spend state');
          result.recommendations.push('Run clearCampaignLogs function to reset the high spend tracking');
        }
      } else {
        // High spend flow has multiple stages
        switch(campaign.lastTrafficSenderStatus) {
          case 'high_spend':
            result.flowStatus = 'detected_high_spend';
            result.recommendations.push('Campaign is in initial high spend state - should move to waiting state');
            break;
            
          case 'high_spend_waiting':
            result.flowStatus = 'waiting_period';
            
            // Check if wait period has elapsed
            if (campaign.lastTrafficSenderAction) {
              const waitDuration = Date.now() - campaign.lastTrafficSenderAction.getTime();
              const waitMinutes = campaign.highSpendWaitMinutes || 11;
              const waitMilliseconds = waitMinutes * 60 * 1000;
              
              if (waitDuration >= waitMilliseconds) {
                result.warnings.push(`Wait period of ${waitMinutes} minutes has elapsed but campaign is still in waiting state`);
                result.recommendations.push('Campaign should have moved to budget calculation state');
              } else {
                const remainingTimeMinutes = Math.ceil((waitMilliseconds - waitDuration) / 60000);
                result.recommendations.push(`Wait period in progress - ${remainingTimeMinutes} minutes remaining`);
              }
            } else {
              result.errors.push('Campaign is in waiting state but has no lastTrafficSenderAction timestamp');
            }
            break;
            
          case 'high_spend_budget_updated':
            result.flowStatus = 'budget_updated';
            
            // Check for issues with TrafficStar
            if (trafficStarStatus && !trafficStarStatus.active) {
              result.errors.push('Campaign budget was updated but TrafficStar campaign is still paused');
              result.recommendations.push('Manually activate the TrafficStar campaign');
            }
            break;
            
          case 'high_spend_update_failed':
            result.flowStatus = 'update_failed';
            result.errors.push('Campaign budget update failed');
            result.recommendations.push('Check logs for the specific error and manually update TrafficStar budget');
            break;
            
          case 'low_spend':
            result.flowStatus = 'inconsistent_state';
            result.errors.push('Campaign has high spend but is marked as low_spend in database');
            result.recommendations.push('Reset campaign status to initiate high spend handling');
            break;
            
          default:
            result.flowStatus = 'unknown';
            result.warnings.push(`Campaign has unknown lastTrafficSenderStatus: ${campaign.lastTrafficSenderStatus}`);
        }
        
        // Check URL budget logs
        if (urlBudgetLogs.length === 0 && result.flowStatus !== 'inconsistent_state') {
          result.errors.push('No URL budget logs found for high spend campaign');
          result.recommendations.push('URL budget logs should be created when high spend is detected');
        }
      }
      
      // 7. Print detailed diagnostic info
      console.log(`Campaign: ${campaign.name} (ID: ${campaign.id}, TrafficStar ID: ${campaign.trafficstarCampaignId})`);
      console.log(`Spent Value: $${spentValue.toFixed(2)} | High Spend: ${result.isHighSpend ? 'YES' : 'NO'}`);
      console.log(`Flow Status: ${result.flowStatus}`);
      console.log(`Last Status: ${campaign.lastTrafficSenderStatus} | Last Action: ${campaign.lastTrafficSenderAction?.toISOString() || 'N/A'}`);
      console.log(`Active URLs: ${result.activeUrls} | Remaining Clicks: ${result.totalRemainingClicks}`);
      
      if (trafficStarStatus) {
        console.log(`TrafficStar Status: ${trafficStarStatus.status} | Daily Budget: ${trafficStarStatus.dailyBudget}`);
      }
      
      console.log(`URL Budget Logs: ${urlBudgetLogs.length} entries`);
      
      if (result.errors.length > 0) {
        console.log('\n⛔ ERRORS:');
        result.errors.forEach(error => console.log(`- ${error}`));
      }
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:');
        result.warnings.forEach(warning => console.log(`- ${warning}`));
      }
      
      if (result.recommendations.length > 0) {
        console.log('\n✅ RECOMMENDATIONS:');
        result.recommendations.forEach(rec => console.log(`- ${rec}`));
      }
      
      console.log('=====================================================\n');
      
      return result;
    } catch (error) {
      console.error(`Error diagnosing high spend flow: ${error}`);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Emergency reset for a campaign stuck in high spend flow
   * @param campaignId Campaign ID to reset
   * @param resetAction Type of reset to perform
   */
  public async emergencyReset(campaignId: number, resetAction: 'logs' | 'status' | 'full'): Promise<any> {
    try {
      console.log(`\n===== EMERGENCY RESET FOR CAMPAIGN ${campaignId} (${resetAction}) =====`);
      
      // Use standard PostgreSQL query instead of Drizzle-specific syntax
      const campaignResult = await pool.query(`
        SELECT * FROM campaigns WHERE id = $1
      `, [campaignId]);
      
      const campaign = campaignResult.rows[0];
      
      if (!campaign) {
        console.log(`❌ Campaign ${campaignId} not found`);
        return { success: false, message: 'Campaign not found' };
      }
      
      const result = {
        campaign: campaignId,
        resetType: resetAction,
        actionsPerformed: [] as string[],
        errors: [] as string[]
      };
      
      // Perform reset actions based on type
      if (resetAction === 'logs' || resetAction === 'full') {
        try {
          await urlBudgetLogger.getInstance().clearCampaignLogs(campaignId);
          result.actionsPerformed.push('Cleared URL budget logs');
        } catch (error) {
          result.errors.push(`Failed to clear URL budget logs: ${error}`);
        }
      }
      
      if (resetAction === 'status' || resetAction === 'full') {
        try {
          // Use standard PostgreSQL query instead of Drizzle-specific syntax
          await pool.query(`
            UPDATE campaigns 
            SET 
              last_traffic_sender_status = 'low_spend',
              last_traffic_sender_action = $1,
              high_spend_budget_calc_time = NULL,
              updated_at = $2
            WHERE id = $3
          `, [new Date(), new Date(), campaignId]);
          
          result.actionsPerformed.push('Reset campaign status to low_spend');
        } catch (error) {
          result.errors.push(`Failed to reset campaign status: ${error}`);
        }
      }
      
      // Only for full reset - check TrafficStar status
      if (resetAction === 'full' && campaign.trafficstarCampaignId) {
        try {
          const tsDetails = await trafficStarService.getCampaignDetails(Number(campaign.trafficstarCampaignId));
          
          if (!tsDetails.active) {
            await trafficStarService.activateCampaign(Number(campaign.trafficstarCampaignId));
            result.actionsPerformed.push('Activated TrafficStar campaign');
          } else {
            result.actionsPerformed.push('TrafficStar campaign already active - no action needed');
          }
        } catch (error) {
          result.errors.push(`Failed to check/update TrafficStar status: ${error}`);
        }
      }
      
      console.log(`Reset completed with ${result.actionsPerformed.length} actions and ${result.errors.length} errors`);
      console.log('=====================================================\n');
      
      return result;
    } catch (error) {
      console.error(`Error performing emergency reset: ${error}`);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Log detailed information about URL budget calculation process
   * @param campaignId Campaign ID to diagnose
   */
  public async logUrlBudgetCalculationDetails(campaignId: number): Promise<any> {
    try {
      console.log(`\n===== URL BUDGET CALCULATION DETAILS FOR CAMPAIGN ${campaignId} =====`);
      
      // Use standard PostgreSQL query instead of Drizzle-specific syntax
      const campaignResult = await pool.query(`
        SELECT * FROM campaigns WHERE id = $1
      `, [campaignId]);
      
      const campaign = campaignResult.rows[0];
      
      // Get active URLs for this campaign
      if (campaign) {
        const urlsResult = await pool.query(`
          SELECT * FROM urls
          WHERE campaign_id = $1 AND status = 'active'
        `, [campaignId]);
        
        // Add URLs to campaign object
        campaign.urls = urlsResult.rows;
      }
      
      if (!campaign) {
        console.log(`❌ Campaign ${campaignId} not found`);
        return { success: false, message: 'Campaign not found' };
      }
      
      if (!campaign.trafficstarCampaignId) {
        console.log(`❌ Campaign ${campaignId} has no TrafficStar campaign ID`);
        return { success: false, message: 'Campaign has no TrafficStar ID' };
      }
      
      const result = {
        campaignDetails: {
          id: campaign.id,
          name: campaign.name,
          trafficstarCampaignId: campaign.trafficstarCampaignId,
          pricePerThousand: campaign.pricePerThousand,
          dailySpent: campaign.dailySpent,
        },
        urlDetails: [] as any[],
        budgetCalculation: {
          currentSpentValue: 0,
          totalRemainingClicks: 0,
          calculatedBudgetForRemaining: 0,
          totalBudget: 0
        },
        loggedUrls: [],
        newUrlsAfterCalc: []
      };
      
      // Calculate spent value
      const spentValue = parseFloat(campaign.dailySpent || '0');
      result.budgetCalculation.currentSpentValue = spentValue;
      
      // Calculate remaining clicks and budget
      let totalRemainingClicks = 0;
      const pricePerThousand = parseFloat(campaign.pricePerThousand || '0');
      
      // Get URL budget logs
      const urlBudgetLogs = await urlBudgetLogger.getInstance().getCampaignUrlBudgetLogs(campaignId);
      const loggedUrlIds = new Set(urlBudgetLogs.map(log => log.urlId));
      
      // Process each URL
      for (const url of campaign.urls) {
        const remainingClicks = url.clickLimit - url.clicks;
        const pricePerClick = pricePerThousand / 1000;
        const urlBudget = remainingClicks * pricePerClick;
        
        // Add to totals
        if (remainingClicks > 0) {
          totalRemainingClicks += remainingClicks;
        }
        
        // Check if URL is logged
        const isLogged = loggedUrlIds.has(url.id);
        
        // Check if URL was added after budget calculation
        let isNewAfterCalc = false;
        if (campaign.highSpendBudgetCalcTime && url.createdAt) {
          isNewAfterCalc = url.createdAt > campaign.highSpendBudgetCalcTime;
        }
        
        // Add to URL details
        result.urlDetails.push({
          id: url.id,
          name: url.name,
          clickLimit: url.clickLimit,
          clicks: url.clicks,
          remainingClicks,
          urlBudget: urlBudget.toFixed(4),
          isLogged,
          isNewAfterCalc
        });
        
        // Add to appropriate list
        if (isLogged) {
          result.loggedUrls.push(url.id);
        }
        
        if (isNewAfterCalc) {
          result.newUrlsAfterCalc.push(url.id);
        }
      }
      
      // Calculate total budget
      const calculatedBudgetForRemaining = (totalRemainingClicks / 1000) * pricePerThousand;
      const totalBudget = spentValue + calculatedBudgetForRemaining;
      
      result.budgetCalculation.totalRemainingClicks = totalRemainingClicks;
      result.budgetCalculation.calculatedBudgetForRemaining = calculatedBudgetForRemaining;
      result.budgetCalculation.totalBudget = totalBudget;
      
      // Print detailed info
      console.log(`Campaign: ${campaign.name} (ID: ${campaign.id}, TrafficStar ID: ${campaign.trafficstarCampaignId})`);
      console.log(`Price Per Thousand: $${pricePerThousand.toFixed(4)} | Spent Value: $${spentValue.toFixed(2)}`);
      console.log(`Active URLs: ${campaign.urls.length} | Total Remaining Clicks: ${totalRemainingClicks}`);
      console.log(`Calculated Budget: $${spentValue.toFixed(2)} (spent) + $${calculatedBudgetForRemaining.toFixed(4)} (remaining) = $${totalBudget.toFixed(4)}`);
      console.log(`URL Budget Logs: ${urlBudgetLogs.length} | New URLs After Calc: ${result.newUrlsAfterCalc.length}`);
      
      console.log('\n--- URL DETAILS ---');
      result.urlDetails.forEach(url => {
        const status = [];
        if (url.isLogged) status.push('LOGGED');
        if (url.isNewAfterCalc) status.push('NEW');
        
        console.log(`URL ${url.id}: ${url.name} | Clicks: ${url.remainingClicks}/${url.clickLimit} | Budget: $${url.urlBudget} | ${status.join(', ') || 'NORMAL'}`);
      });
      
      console.log('=====================================================\n');
      
      return result;
    } catch (error) {
      console.error(`Error logging URL budget calculation details: ${error}`);
      return { success: false, error: String(error) };
    }
  }
}

// Create singleton instance
const highSpendDiagnosis = new HighSpendDiagnosis();
export default highSpendDiagnosis;