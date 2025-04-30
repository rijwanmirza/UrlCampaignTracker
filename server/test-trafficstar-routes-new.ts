import { Request, Response } from 'express';
import { trafficStarService } from './trafficstar-service';
import { db } from './db';
import { campaigns } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Test routes for TrafficStar API integration
 * These routes are only for testing purposes and should not be used in production
 */
export function registerTestTrafficstarRoutes(app: any) {
  
  // Test route for forcing budget update
  app.post('/api/test/trafficstar/force-budget-update', async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId parameter' });
      }
      
      // Get the campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, parseInt(campaignId)));
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      if (!campaign.trafficstarCampaignId) {
        return res.status(400).json({ error: 'Campaign has no TrafficStar ID' });
      }
      
      console.log(`🧪 TEST: Forcing budget update for campaign ${campaignId} (TS: ${campaign.trafficstarCampaignId})`);
      
      // Force budget update using updateCampaignBudget
      // Set budget to fixed value ($10.15)
      const trafficstarId = parseInt(campaign.trafficstarCampaignId);
      // Using the standard function for updating budgets
      await trafficStarService.updateCampaignBudget(trafficstarId, 10.15);
      
      // Get current UTC date
      const currentUtcDate = new Date().toISOString().split('T')[0];
      console.log(`Successfully updated budget for campaign ${trafficstarId} to $10.15 on ${currentUtcDate}`);
      
      return res.status(200).json({
        message: `Budget update forced for campaign ${campaignId}`,
        trafficstarId: campaign.trafficstarCampaignId
      });
    } catch (error) {
      console.error('Error in force budget update test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Test route for updating spent values
  app.post('/api/test/trafficstar/update-spent-values', async (req: Request, res: Response) => {
    try {
      console.log(`🧪 TEST: Forcing spent value update for all campaigns`);
      
      // Force trafficStarService to update spent values
      await trafficStarService.updateAllCampaignsSpentValues();
      
      return res.status(200).json({
        message: `Spent values updated for all campaigns with TrafficStar integration`
      });
    } catch (error) {
      console.error('Error in update spent values test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Test route to get spent value for a campaign
  app.post('/api/test/trafficstar/get-spent-value', async (req: Request, res: Response) => {
    try {
      const { campaignId, dateFrom, dateUntil } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId parameter' });
      }
      
      // Get the campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, parseInt(campaignId)));
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      if (!campaign.trafficstarCampaignId) {
        return res.status(400).json({ error: 'Campaign has no TrafficStar ID' });
      }
      
      const trafficstarId = parseInt(campaign.trafficstarCampaignId);
      
      console.log(`🧪 TEST: Getting spent value for campaign ${campaignId} (TS: ${trafficstarId})`);
      
      // Get spent value
      const spentValue = await trafficStarService.getCampaignSpentValue(
        trafficstarId, 
        dateFrom, 
        dateUntil
      );
      
      return res.status(200).json({
        campaignId,
        trafficstarId,
        spentValue
      });
    } catch (error) {
      console.error('Error in get spent value test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}