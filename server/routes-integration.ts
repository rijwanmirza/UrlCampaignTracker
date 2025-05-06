/**
 * Routes Integration with URL Budget Tracker
 * 
 * This file contains integration code for connecting the URL budget tracker
 * with existing routes and functionality in the application.
 */

import { urlBudgetTracker } from './url-budget-tracker';
import { trafficGenerator } from './traffic-generator-new';
import express from 'express';

/**
 * Initialize URL budget tracker integration with routes
 * @param app Express application
 */
export function initUrlBudgetTrackerRoutes(app: express.Application) {
  // Track new URL budget when a URL is created and marked as active
  app.post('/api/track-new-url-budget', async (req, res) => {
    try {
      const { urlId } = req.body;
      
      if (!urlId) {
        return res.status(400).json({ error: 'URL ID is required' });
      }
      
      await urlBudgetTracker.trackNewUrlBudget(Number(urlId));
      
      return res.json({ success: true, message: `Budget tracking initiated for URL ${urlId}` });
    } catch (error) {
      console.error('Error tracking new URL budget:', error);
      return res.status(500).json({ error: 'Failed to track URL budget' });
    }
  });
  
  // Track all URL budgets for a campaign
  app.post('/api/track-campaign-url-budgets', async (req, res) => {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId) {
        return res.status(400).json({ error: 'Campaign ID is required' });
      }
      
      await urlBudgetTracker.trackCampaignUrlBudgets(Number(campaignId));
      
      return res.json({ success: true, message: `Budget tracking initiated for all URLs in campaign ${campaignId}` });
    } catch (error) {
      console.error('Error tracking campaign URL budgets:', error);
      return res.status(500).json({ error: 'Failed to track campaign URL budgets' });
    }
  });

  console.log('URL Budget Tracker routes initialized');
}

/**
 * Hook to connect URL budget tracker to existing campaign activation processes
 * @param campaignId Campaign ID to track
 */
export async function trackCampaignUrlBudgetsOnActivation(campaignId: number) {
  try {
    // Check if traffic generator is enabled for this campaign
    const isEnabled = await trafficGeneratorConfig.isCampaignEnabled(campaignId);
    
    if (isEnabled) {
      console.log(`Campaign ${campaignId} is being activated with Traffic Generator enabled. Tracking URL budgets...`);
      await urlBudgetTracker.trackCampaignUrlBudgets(campaignId);
    } else {
      console.log(`Campaign ${campaignId} is being activated but Traffic Generator is disabled. Skipping URL budget tracking.`);
    }
  } catch (error) {
    console.error(`Error tracking URL budgets for campaign ${campaignId} on activation:`, error);
  }
}

/**
 * Hook to track budget for a newly added URL
 * @param urlId URL ID to track
 */
export async function trackNewUrlBudgetOnAdd(urlId: number) {
  try {
    console.log(`URL ${urlId} has been added. Tracking URL budget...`);
    await urlBudgetTracker.trackNewUrlBudget(urlId);
  } catch (error) {
    console.error(`Error tracking budget for new URL ${urlId}:`, error);
  }
}