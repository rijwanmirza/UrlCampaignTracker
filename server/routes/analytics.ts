import { Router } from 'express';
import { storage } from '../storage';
import { analyticsFilterSchema } from '@shared/schema';
import { z } from 'zod';

const router = Router();

/**
 * Get analytics data with filtering
 */
router.post('/api/analytics', async (req, res) => {
  try {
    // Validate request body
    const validationResult = analyticsFilterSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: validationResult.error.format()
      });
    }
    
    const filter = validationResult.data;
    
    // Get analytics data from storage
    const analyticsData = await storage.getAnalytics(filter);
    
    return res.json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get analytics data'
    });
  }
});

/**
 * Get campaigns list for analytics selection
 */
router.get('/api/analytics/campaigns', async (req, res) => {
  try {
    const campaigns = await storage.getCampaignsList();
    
    return res.json({
      success: true,
      data: campaigns
    });
  } catch (error) {
    console.error('Error getting campaigns list for analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get campaigns list'
    });
  }
});

/**
 * Get URLs list for analytics selection with optional search
 */
router.get('/api/analytics/urls', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    
    const urls = await storage.getUrlsList(search);
    
    return res.json({
      success: true,
      data: urls
    });
  } catch (error) {
    console.error('Error getting URLs list for analytics:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get URLs list'
    });
  }
});

export default router;