import express from 'express';
import urlBudgetManager from './url-budget-manager';
import urlBudgetLogger from './url-budget-logger';
import { db } from './db';
import { urls } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

// Test routes for URL budget logging and management
router.post('/log-budget', async (req, res) => {
  try {
    const { urlId, campaignId, price } = req.body;
    if (!urlId || price === undefined || !campaignId) {
      return res.status(400).json({ error: 'URL ID, campaign ID, and price are required' });
    }
    
    // Get URL name if not provided
    try {
      const [urlData] = await db.select({ name: urls.name }).from(urls).where(eq(urls.id, parseInt(urlId)));
      const urlName = urlData?.name || `URL-${urlId}`;
      
      // Log the URL budget
      const result = await urlBudgetLogger.logUrlBudget(
        parseInt(campaignId),
        parseInt(urlId),
        urlName,
        parseFloat(price)
      );
      
      res.json({ success: true, logged: result, message: 'URL budget processed successfully' });
    } catch (innerError) {
      console.error('Error getting URL details:', innerError);
      res.status(500).json({ error: 'Failed to get URL details' });
    }
  } catch (error) {
    console.error('Error logging URL budget:', error);
    res.status(500).json({ error: 'Failed to log URL budget' });
  }
});

router.post('/process-pending', async (req, res) => {
  try {
    const { campaignId } = req.body;
    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }
    
    // Process pending updates immediately for the specified campaign
    const result = await urlBudgetManager.processImmediately(parseInt(campaignId));
    res.json({ 
      success: result, 
      message: result ? 'Processed pending budget updates' : 'No pending updates found or failed to process' 
    });
  } catch (error) {
    console.error('Error processing pending budget updates:', error);
    res.status(500).json({ error: 'Failed to process pending budget updates' });
  }
});

router.post('/cancel-pending', async (req, res) => {
  try {
    const { campaignId } = req.body;
    if (!campaignId) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }
    
    // Cancel pending updates for the specified campaign
    urlBudgetManager.cancelPendingUpdates(parseInt(campaignId));
    res.json({ success: true, message: 'Cancelled pending budget updates' });
  } catch (error) {
    console.error('Error cancelling pending budget updates:', error);
    res.status(500).json({ error: 'Failed to cancel pending budget updates' });
  }
});

export default router;