import type { Express } from "express";

// Test routes for reporting API functionality
export function registerReportsAPITestRoutes(app: Express) {
  app.get('/api/test-reports/summary', (req, res) => {
    try {
      // Simulate report data
      const reportData = {
        totalCampaigns: 10,
        activeCampaigns: 6,
        pausedCampaigns: 4,
        totalUrls: 125,
        activeUrls: 95,
        pendingUrls: 15,
        rejectedUrls: 15,
        stats: {
          totalClicks: 12580,
          dailyClicks: 1450,
          clickThroughRate: 0.42,
          averageBudgetSpent: 25.6,
        }
      };

      res.json({ success: true, data: reportData });
    } catch (error) {
      console.error('Error generating test report summary:', error);
      res.status(500).json({ error: 'Failed to generate report summary' });
    }
  });

  app.get('/api/test-reports/performance', (req, res) => {
    try {
      // Simulate performance data
      const data = {
        dailyPerformance: [
          { date: '2023-04-01', clicks: 1200, spend: 24.50, ctr: 0.41 },
          { date: '2023-04-02', clicks: 1350, spend: 27.80, ctr: 0.42 },
          { date: '2023-04-03', clicks: 1100, spend: 21.30, ctr: 0.40 },
          { date: '2023-04-04', clicks: 1450, spend: 29.10, ctr: 0.43 },
          { date: '2023-04-05', clicks: 1380, spend: 27.90, ctr: 0.42 },
        ],
        campaignPerformance: [
          { id: 1, name: 'Campaign A', clicks: 4200, spend: 85.40, ctr: 0.44 },
          { id: 2, name: 'Campaign B', clicks: 3800, spend: 76.20, ctr: 0.41 },
          { id: 3, name: 'Campaign C', clicks: 4580, spend: 92.30, ctr: 0.45 },
        ]
      };

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error generating test performance report:', error);
      res.status(500).json({ error: 'Failed to generate performance report' });
    }
  });
}