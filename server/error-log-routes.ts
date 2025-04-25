/**
 * Error Log Routes
 * This file contains the routes for accessing and managing API error logs
 */

import express, { Request, Response } from 'express';
import { db } from './db';
import { apiErrorLogs } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = express.Router();

/**
 * Get paginated error logs
 * GET /api/logs/trafficstar-errors
 */
router.get('/trafficstar-errors', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    
    // Get logs with pagination
    const logs = await db
      .select()
      .from(apiErrorLogs)
      .orderBy(desc(apiErrorLogs.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(apiErrorLogs);
    
    const totalPages = Math.ceil(count / limit);
    
    res.json({
      logs,
      pagination: {
        page,
        limit,
        totalItems: count,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({ message: 'Failed to fetch error logs' });
  }
});

/**
 * Mark error log as resolved
 * POST /api/logs/trafficstar-errors/:id/resolve
 */
router.post('/trafficstar-errors/:id/resolve', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    await db
      .update(apiErrorLogs)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(apiErrorLogs.id, id));
    
    res.json({ message: 'Error log marked as resolved' });
  } catch (error) {
    console.error('Error marking log as resolved:', error);
    res.status(500).json({ message: 'Failed to mark error log as resolved' });
  }
});

/**
 * Clear all resolved logs
 * DELETE /api/logs/trafficstar-errors/resolved
 */
router.delete('/trafficstar-errors/resolved', async (_req: Request, res: Response) => {
  try {
    const result = await db
      .delete(apiErrorLogs)
      .where(eq(apiErrorLogs.resolved, true));
    
    res.json({ 
      message: 'Resolved error logs cleared',
      count: result.count || 0
    });
  } catch (error) {
    console.error('Error clearing resolved logs:', error);
    res.status(500).json({ message: 'Failed to clear resolved error logs' });
  }
});

export default router;