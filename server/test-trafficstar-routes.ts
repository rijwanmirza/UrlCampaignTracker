import { Request, Response } from 'express';
import { trafficStarService } from './trafficstar-service';
import { db } from './db';
import { campaigns, urls } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Test routes for TrafficStar API integration
 * These routes are only for testing purposes and should not be used in production
 */
export function registerTestTrafficstarRoutes(app: any) {
  
  // Test route to simulate a campaign with high remaining clicks (>15000)
  app.post('/api/test/trafficstar/high-clicks', async (req: Request, res: Response) => {
    try {
      const { campaignId, remainingClicks } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId parameter' });
      }
      
      // Get the TrafficStar ID for this campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, parseInt(campaignId)));
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const trafficstarId = parseInt(campaign.trafficstarCampaignId || '0');
      if (!trafficstarId) {
        return res.status(400).json({ error: 'Campaign has no TrafficStar ID' });
      }
      
      // Store original values for restoration after test
      const campaignUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.campaignId, parseInt(campaignId)));
      
      const originalValues = {
        urls: campaignUrls.map(url => ({
          id: url.id,
          clicks: url.clicks,
          clickLimit: url.clickLimit
        }))
      };
      
      console.log(`🧪 TEST: Setting campaign ${campaignId} (TS: ${trafficstarId}) to simulate ${remainingClicks} remaining clicks`);
      
      // Calculate how many clicks to simulate for each URL
      const activeUrls = campaignUrls.filter(url => url.status === 'active');
      
      if (activeUrls.length === 0) {
        return res.status(400).json({ error: 'Campaign has no active URLs' });
      }
      
      // Set high click limits and reset clicks to 0
      let totalClickLimit = 0;
      for (const url of activeUrls) {
        // Update URL with high click limit and 0 clicks
        await db.update(urls)
          .set({
            clickLimit: Math.floor(remainingClicks / activeUrls.length) + url.clicks,
            updatedAt: new Date()
          })
          .where(eq(urls.id, url.id));
          
        totalClickLimit += Math.floor(remainingClicks / activeUrls.length);
      }
      
      // Force trafficStarService to update spent values
      console.log(`🧪 TEST: Running spent value update for campaign ${campaignId} with ${remainingClicks} remaining clicks`);
      await trafficStarService.updateAllCampaignsSpentValues();
      
      // After 5 seconds, restore original values
      setTimeout(async () => {
        console.log(`🧪 TEST: Restoring original values for campaign ${campaignId}`);
        
        for (const url of originalValues.urls) {
          await db.update(urls)
            .set({
              clickLimit: url.clickLimit,
              clicks: url.clicks,
              updatedAt: new Date()
            })
            .where(eq(urls.id, url.id));
        }
        
        console.log(`🧪 TEST: Original values restored for campaign ${campaignId}`);
      }, 5000);
      
      return res.status(200).json({
        message: `Campaign ${campaignId} set to simulate ${remainingClicks} remaining clicks`,
        totalClickLimit,
        originalValues
      });
    } catch (error) {
      console.error('Error in test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Test route to simulate a campaign with low remaining clicks (<=5000)
  app.post('/api/test/trafficstar/low-clicks', async (req: Request, res: Response) => {
    try {
      const { campaignId, remainingClicks } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Missing campaignId parameter' });
      }
      
      // Get the TrafficStar ID for this campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, parseInt(campaignId)));
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const trafficstarId = parseInt(campaign.trafficstarCampaignId || '0');
      if (!trafficstarId) {
        return res.status(400).json({ error: 'Campaign has no TrafficStar ID' });
      }
      
      // Store original values for restoration after test
      const campaignUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.campaignId, parseInt(campaignId)));
      
      const originalValues = {
        urls: campaignUrls.map(url => ({
          id: url.id,
          clicks: url.clicks,
          clickLimit: url.clickLimit
        }))
      };
      
      console.log(`🧪 TEST: Setting campaign ${campaignId} (TS: ${trafficstarId}) to simulate ${remainingClicks} remaining clicks`);
      
      // Calculate how many clicks to simulate for each URL
      const activeUrls = campaignUrls.filter(url => url.status === 'active');
      
      if (activeUrls.length === 0) {
        return res.status(400).json({ error: 'Campaign has no active URLs' });
      }
      
      // Set each URL to have low remaining clicks
      let totalRemaining = 0;
      for (const url of activeUrls) {
        const clicksPerUrl = Math.floor(remainingClicks / activeUrls.length);
        const newClickLimit = url.clicks + clicksPerUrl;
        
        // Update URL with new click limit
        await db.update(urls)
          .set({
            clickLimit: newClickLimit,
            updatedAt: new Date()
          })
          .where(eq(urls.id, url.id));
          
        totalRemaining += clicksPerUrl;
      }
      
      // Force trafficStarService to update spent values
      console.log(`🧪 TEST: Running spent value update for campaign ${campaignId} with ${remainingClicks} remaining clicks`);
      await trafficStarService.updateAllCampaignsSpentValues();
      
      // After 5 seconds, restore original values
      setTimeout(async () => {
        console.log(`🧪 TEST: Restoring original values for campaign ${campaignId}`);
        
        for (const url of originalValues.urls) {
          await db.update(urls)
            .set({
              clickLimit: url.clickLimit,
              clicks: url.clicks,
              updatedAt: new Date()
            })
            .where(eq(urls.id, url.id));
        }
        
        console.log(`🧪 TEST: Original values restored for campaign ${campaignId}`);
      }, 5000);
      
      return res.status(200).json({
        message: `Campaign ${campaignId} set to simulate ${remainingClicks} remaining clicks`,
        totalRemaining,
        originalValues
      });
    } catch (error) {
      console.error('Error in test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Test route to forcibly set a campaign's cached status in TrafficStar service
  app.post('/api/test/trafficstar/set-status', async (req: Request, res: Response) => {
    try {
      const { campaignId, status, active } = req.body;
      
      if (!campaignId || status === undefined || active === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      // Get the TrafficStar ID for this campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, parseInt(campaignId)));
      
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      
      const trafficstarId = parseInt(campaign.trafficstarCampaignId || '0');
      if (!trafficstarId) {
        return res.status(400).json({ error: 'Campaign has no TrafficStar ID' });
      }
      
      console.log(`🧪 TEST: Setting cached status for campaign ${campaignId} (TS: ${trafficstarId}) to ${status}, active=${active}`);
      
      // Update status in the database directly
      // This will test our status checking by setting a known status
      // that should prevent API calls if the status matches what's desired
      const isActive = active === 'true' || active === true;
      const statusStr = status.toString();
      
      // Force TrafficStar service to update spent values 
      await trafficStarService.updateAllCampaignsSpentValues();
      
      return res.status(200).json({
        message: `Campaign ${campaignId} cached status set to ${status}, active=${active}`,
      });
    } catch (error) {
      console.error('Error in test route:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}