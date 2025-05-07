import express from 'express';
import { db } from './db';
import { campaigns, urls } from '../shared/schema';
import { eq } from 'drizzle-orm';
import urlBudgetLogger from './url-budget-logger';

const router = express.Router();

/**
 * API endpoint to manually trigger high-spend detection for testing
 * POST /api/url-budget-test/high-spend
 * body: { campaignId: number, spentValue: number }
 */
router.post('/high-spend', async (req, res) => {
  try {
    const { campaignId, spentValue } = req.body;
    
    if (!campaignId || typeof campaignId !== 'number') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid campaignId. Must be a number.' 
      });
    }
    
    if (!spentValue || typeof spentValue !== 'number' || spentValue <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid spentValue. Must be a positive number.' 
      });
    }
    
    // Check if campaign exists
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId)
    });
    
    if (!campaign) {
      return res.status(404).json({ 
        success: false, 
        message: `Campaign with ID ${campaignId} not found.` 
      });
    }
    
    // Get campaign's active URLs
    const activeUrls = await db.query.urls.findMany({
      where: (url, { eq, and }) => and(
        eq(url.campaignId, campaignId),
        eq(url.status, 'active')
      )
    });
    
    if (activeUrls.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Campaign ${campaignId} has no active URLs.` 
      });
    }
    
    console.log(`🔶 MANUAL TEST: Simulating high-spend detection for campaign ${campaignId} with spent value $${spentValue.toFixed(2)}`);
    
    // Clear previous logs to simulate a fresh high-spend event
    await urlBudgetLogger.clearLogs();
    console.log(`🧹 Cleared previous URL budget logs for clean test`);
    
    // Process each URL and log budgets
    const pricePerThousand = parseFloat(campaign.pricePerThousand || '0');
    let totalRemainingClicks = 0;
    let totalBudgetForRemainingClicks = 0;
    const logResults = [];
    
    for (const url of activeUrls) {
      // Calculate remaining clicks and price
      const remainingClicks = url.clickLimit - url.clicks;
      const validRemaining = remainingClicks > 0 ? remainingClicks : 0;
      totalRemainingClicks += validRemaining;
      
      // Calculate price per URL (price per thousand * remaining clicks / 1000)
      const urlPrice = (validRemaining / 1000) * pricePerThousand;
      totalBudgetForRemainingClicks += urlPrice;
      
      // Log the URL budget
      const wasLogged = await urlBudgetLogger.logUrlBudget(url.id, urlPrice);
      
      // Save result for response
      logResults.push({
        urlId: url.id,
        clicks: url.clicks,
        clickLimit: url.clickLimit,
        remainingClicks: validRemaining,
        price: urlPrice.toFixed(4),
        wasLogged
      });
    }
    
    // Calculate new total budget
    const newTotalBudget = spentValue + totalBudgetForRemainingClicks;
    
    // Mark high spend detection with calculation time
    await db.update(campaigns)
      .set({
        highSpendBudgetCalcTime: new Date(),
        lastTrafficSenderStatus: 'high_spend_budget_updated',
        lastTrafficSenderAction: new Date()
      })
      .where(eq(campaigns.id, campaignId));
    
    // Get the logs to return in response
    const logs = await urlBudgetLogger.getUrlBudgetLogs();
    
    // Return detailed response
    res.status(200).json({
      success: true,
      message: `Successfully simulated high-spend budget calculation for campaign ${campaignId}`,
      testDetails: {
        campaignId,
        spentValue: spentValue.toFixed(2),
        pricePerThousand: pricePerThousand.toFixed(2),
        totalRemainingClicks,
        totalBudgetForRemainingClicks: totalBudgetForRemainingClicks.toFixed(4),
        newTotalBudget: newTotalBudget.toFixed(4),
        highSpendBudgetCalcTime: new Date().toISOString()
      },
      urlResults: logResults,
      logs
    });
    
  } catch (error) {
    console.error(`❌ Error in high-spend test endpoint: ${error}`);
    res.status(500).json({ 
      success: false, 
      message: `An error occurred: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * API endpoint to manually simulate a new URL added after high-spend detection
 * POST /api/url-budget-test/new-url-after-high-spend
 * body: { campaignId: number, url: { id: number, clickLimit: number, clicks: number } }
 */
router.post('/new-url-after-high-spend', async (req, res) => {
  try {
    const { campaignId, url } = req.body;
    
    if (!campaignId || typeof campaignId !== 'number') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid campaignId. Must be a number.' 
      });
    }
    
    if (!url || !url.id || !url.clickLimit || url.clickLimit <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid URL data. Must include id and clickLimit.' 
      });
    }
    
    // Check if campaign exists and has highSpendBudgetCalcTime set
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId)
    });
    
    if (!campaign) {
      return res.status(404).json({ 
        success: false, 
        message: `Campaign with ID ${campaignId} not found.` 
      });
    }
    
    if (!campaign.highSpendBudgetCalcTime) {
      return res.status(400).json({ 
        success: false, 
        message: `Campaign ${campaignId} has no highSpendBudgetCalcTime set. Run high-spend test first.` 
      });
    }
    
    console.log(`🔶 MANUAL TEST: Simulating new URL added after high-spend detection for campaign ${campaignId}`);
    
    // Calculate price based on the TOTAL clicks (not remaining clicks), since this is a new URL
    const pricePerThousand = parseFloat(campaign.pricePerThousand || '0');
    const totalClicks = url.clickLimit;
    const urlPrice = (totalClicks / 1000) * pricePerThousand;
    
    // Log the URL budget
    const wasLogged = await urlBudgetLogger.logUrlBudget(url.id, urlPrice);
    
    // Get the updated logs to return in response
    const logs = await urlBudgetLogger.getUrlBudgetLogs();
    
    // Return detailed response
    res.status(200).json({
      success: true,
      message: `Successfully simulated new URL added after high-spend for campaign ${campaignId}`,
      testDetails: {
        campaignId,
        pricePerThousand: pricePerThousand.toFixed(2),
        urlId: url.id,
        totalClicks,
        urlPrice: urlPrice.toFixed(4),
        wasLogged
      },
      logs
    });
    
  } catch (error) {
    console.error(`❌ Error in new-url-after-high-spend test endpoint: ${error}`);
    res.status(500).json({ 
      success: false, 
      message: `An error occurred: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * API endpoint to clear URL budget logs
 * POST /api/url-budget-test/clear-logs
 */
router.post('/clear-logs', async (req, res) => {
  try {
    await urlBudgetLogger.clearLogs();
    
    res.status(200).json({
      success: true,
      message: 'Successfully cleared URL budget logs',
      logs: []
    });
    
  } catch (error) {
    console.error(`❌ Error clearing URL budget logs: ${error}`);
    res.status(500).json({ 
      success: false, 
      message: `An error occurred: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

/**
 * API endpoint to get URL budget logs
 * GET /api/url-budget-test/logs
 */
router.get('/logs', async (req, res) => {
  try {
    const logs = await urlBudgetLogger.getUrlBudgetLogs();
    
    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
    
  } catch (error) {
    console.error(`❌ Error getting URL budget logs: ${error}`);
    res.status(500).json({ 
      success: false, 
      message: `An error occurred: ${error instanceof Error ? error.message : String(error)}` 
    });
  }
});

export default router;