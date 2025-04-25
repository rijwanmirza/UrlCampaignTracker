/**
 * Error Log Routes
 * This file contains the routes for accessing and managing API error logs
 */
import { Request, Response, Router } from 'express';
import { db } from './db';
import { apiErrorLogs } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

// Create a router for error log routes
const router = Router();

/**
 * Get paginated error logs
 * GET /api/logs/trafficstar-errors
 */
router.get('/trafficstar-errors', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    // Get the total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(apiErrorLogs);
    
    const total = countResult?.count || 0;
    
    // Get the paginated logs ordered by newest first
    const logs = await db
      .select()
      .from(apiErrorLogs)
      .orderBy(desc(apiErrorLogs.createdAt))
      .limit(limit)
      .offset(offset);
    
    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error retrieving API error logs:", error);
    res.status(500).json({ error: "Failed to retrieve API error logs" });
  }
});

/**
 * Get error log details
 * GET /api/logs/trafficstar-errors/:id
 */
router.get('/trafficstar-errors/:id', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id);
    
    const [log] = await db
      .select()
      .from(apiErrorLogs)
      .where(eq(apiErrorLogs.id, logId));
    
    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }
    
    res.json(log);
  } catch (error) {
    console.error("Error retrieving API error log details:", error);
    res.status(500).json({ error: "Failed to retrieve API error log details" });
  }
});

/**
 * Mark error log as resolved
 * POST /api/logs/trafficstar-errors/:id/resolve
 */
router.post('/trafficstar-errors/:id/resolve', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id);
    
    const [log] = await db
      .select()
      .from(apiErrorLogs)
      .where(eq(apiErrorLogs.id, logId));
    
    if (!log) {
      return res.status(404).json({ error: "Log not found" });
    }
    
    await db.update(apiErrorLogs)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(apiErrorLogs.id, logId));
    
    res.json({ success: true, message: "Log marked as resolved" });
  } catch (error) {
    console.error("Error resolving API error log:", error);
    res.status(500).json({ error: "Failed to resolve API error log" });
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
      success: true, 
      message: "Cleared all resolved error logs",
      count: result.length
    });
  } catch (error) {
    console.error("Error clearing resolved API error logs:", error);
    res.status(500).json({ error: "Failed to clear resolved API error logs" });
  }
});

export default router;