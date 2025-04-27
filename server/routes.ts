import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import spdy from 'spdy';
import type { Server as SpdyServer } from 'spdy';
import { storage } from "./storage";
import { 
  insertCampaignSchema, 
  updateCampaignSchema,
  insertUrlSchema, 
  updateUrlSchema,
  bulkUrlActionSchema,
  insertTrafficstarCredentialSchema,
  trafficstarCampaignActionSchema,
  trafficstarCampaignBudgetSchema,
  trafficstarCampaignEndTimeSchema,
  trafficstarCampaigns,
  campaigns,
  urls
} from "@shared/schema";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import { gmailReader } from "./gmail-reader";
import { trafficStarService } from "./trafficstar-service";
import { db, pool } from "./db";
import { eq, and, isNotNull } from "drizzle-orm";
import Imap from "imap";

export async function registerRoutes(app: Express): Promise<Server> {
  // Just create a regular HTTP server for now
  // We'll handle HTTP/2 headers in the route handlers
  const server = createServer(app);
  
  // API routes for Original Click Values feature
  // Get all URLs with their original click values and campaign associations
  app.get("/api/original-clicks", async (_req: Request, res: Response) => {
    try {
      // Fetch all URLs with original click values
      const urlsResult = await db.execute(`
        SELECT u.id, u.name, u.target_url, u.original_click_limit, u.click_limit, u.clicks,
               array_agg(c.name) FILTER (WHERE c.id IS NOT NULL) AS used_in_campaigns
        FROM urls u
        LEFT JOIN campaigns c ON u.campaign_id = c.id
        GROUP BY u.id, u.name, u.target_url, u.original_click_limit, u.click_limit, u.clicks
        ORDER BY u.id DESC
      `);
      
      if (!urlsResult || !urlsResult.rows) {
        return res.status(500).json({ message: "Failed to fetch URLs data" });
      }
      
      res.json(urlsResult.rows);
    } catch (error) {
      console.error("Error fetching original click values:", error);
      res.status(500).json({ 
        message: "Failed to fetch original click values", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // First, create a stored procedure to handle original click updates safely
  app.post("/api/system/setup-click-update-function", async (_req: Request, res: Response) => {
    try {
      // Create a function that handles the original click update within the database
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_original_click_value(
          url_id INTEGER,
          new_original_click_limit INTEGER
        ) RETURNS JSONB AS $$
        DECLARE
          current_url RECORD;
          multiplier FLOAT;
          new_click_limit INTEGER;
          result JSONB;
        BEGIN
          -- Get current URL
          SELECT id, name, original_click_limit, click_limit
          INTO current_url
          FROM urls
          WHERE id = url_id;
          
          IF current_url IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'URL not found');
          END IF;
          
          -- Calculate multiplier if any exists
          multiplier := 1;
          IF current_url.original_click_limit > 0 AND current_url.click_limit > current_url.original_click_limit THEN
            multiplier := ROUND(current_url.click_limit::float / current_url.original_click_limit::float);
          END IF;
          
          -- Apply multiplier to new limit
          new_click_limit := new_original_click_limit * multiplier;
          
          -- Temporarily disable protection
          UPDATE protection_settings
          SET value = FALSE
          WHERE key = 'click_protection_enabled';
          
          -- Update URL
          UPDATE urls
          SET original_click_limit = new_original_click_limit,
              click_limit = new_click_limit,
              updated_at = NOW()
          WHERE id = url_id;
          
          -- Re-enable protection
          UPDATE protection_settings
          SET value = TRUE
          WHERE key = 'click_protection_enabled';
          
          -- Return success
          RETURN jsonb_build_object(
            'success', true,
            'message', 'Original click value updated',
            'url', jsonb_build_object(
              'id', url_id,
              'name', current_url.name,
              'original_click_limit', new_original_click_limit,
              'click_limit', new_click_limit,
              'multiplier', multiplier
            )
          );
        END;
        $$ LANGUAGE plpgsql;
      `);
      
      res.json({
        success: true,
        message: "Click update database function created successfully"
      });
    } catch (error) {
      console.error("Error creating click update function:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create click update function",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update original click value for a URL and propagate the change using the database function
  app.patch("/api/original-clicks/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const original_click_limit = req.body.original_click_limit;
      
      // Basic validation
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      if (original_click_limit === undefined || isNaN(parseInt(original_click_limit))) {
        return res.status(400).json({ message: "Invalid original click limit value" });
      }
      
      console.log(`=== STARTING ORIGINAL CLICK VALUE UPDATE FOR URL ${id} ===`);
      console.log(`New original click value: ${original_click_limit}`);
      
      // Call the database function directly
      const result = await pool.query(
        `SELECT update_original_click_value($1, $2) as result`, 
        [parseInt(id), parseInt(original_click_limit)]
      );
      
      if (!result || !result.rows || result.rows.length === 0) {
        return res.status(500).json({ message: "Failed to update original click value (no result)" });
      }
      
      const updateResult = result.rows[0].result;
      
      if (!updateResult.success) {
        return res.status(404).json({ message: updateResult.message });
      }
      
      console.log(`✅ Original click value updated successfully: ${JSON.stringify(updateResult.url)}`);
      
      // Return the updated URL
      res.json({
        message: updateResult.message,
        url: updateResult.url
      });
    } catch (error) {
      console.error("Error updating original click value:", error);
      res.status(500).json({ 
        message: "Failed to update original click value", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // API route to apply click protection
  app.post("/api/system/click-protection/apply", async (_req: Request, res: Response) => {
    try {
      console.log('=== Applying Click Protection ===');
      console.log('This will install database triggers to prevent automatic updates to click values');
      
      // Create settings table for protection configuration
      await db.execute(`
        CREATE TABLE IF NOT EXISTS protection_settings (
          key TEXT PRIMARY KEY,
          value BOOLEAN NOT NULL
        )
      `);

      // Initialize with default value if not exists
      await db.execute(`
        INSERT INTO protection_settings (key, value)
        VALUES ('click_protection_enabled', TRUE)
        ON CONFLICT (key) DO NOTHING
      `);

      // Create table to track sync operations
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sync_operations (
          id SERIAL PRIMARY KEY,
          is_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
          started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE
        )
      `);

      // Function to check if click protection is enabled
      await db.execute(`
        CREATE OR REPLACE FUNCTION click_protection_enabled()
        RETURNS BOOLEAN AS $$
        BEGIN
          RETURN (SELECT value FROM protection_settings WHERE key = 'click_protection_enabled');
        END;
        $$ LANGUAGE plpgsql
      `);

      // Function to check if an automatic sync is in progress
      await db.execute(`
        CREATE OR REPLACE FUNCTION is_auto_sync()
        RETURNS BOOLEAN AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM sync_operations 
            WHERE is_auto_sync = TRUE AND completed_at IS NULL
          );
        END;
        $$ LANGUAGE plpgsql
      `);

      // Function to start an auto-sync operation
      await db.execute(`
        CREATE OR REPLACE FUNCTION start_auto_sync()
        RETURNS INTEGER AS $$
        DECLARE
          operation_id INTEGER;
        BEGIN
          INSERT INTO sync_operations (is_auto_sync) 
          VALUES (TRUE) 
          RETURNING id INTO operation_id;
          
          RETURN operation_id;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Function to end an auto-sync operation
      await db.execute(`
        CREATE OR REPLACE FUNCTION end_auto_sync(operation_id INTEGER)
        RETURNS VOID AS $$
        BEGIN
          UPDATE sync_operations
          SET completed_at = NOW()
          WHERE id = operation_id;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Create a function that prevents automatic updates to click values in URLs
      await db.execute(`
        CREATE OR REPLACE FUNCTION prevent_auto_click_updates()
        RETURNS TRIGGER AS $$
        BEGIN
          -- If this is an automatic sync operation
          IF click_protection_enabled() AND is_auto_sync() THEN
            -- Restore the original click_limit value if it was changed
            IF NEW.click_limit IS DISTINCT FROM OLD.click_limit THEN
              RAISE WARNING 'Preventing automatic update to click_limit (from % to %) for URL %', 
                OLD.click_limit, NEW.click_limit, NEW.id;
              NEW.click_limit := OLD.click_limit;
            END IF;
            
            -- Restore the original clicks value if it was changed
            IF NEW.clicks IS DISTINCT FROM OLD.clicks THEN
              RAISE WARNING 'Preventing automatic update to clicks (from % to %) for URL %', 
                OLD.clicks, NEW.clicks, NEW.id;
              NEW.clicks := OLD.clicks;
            END IF;
            
            -- Restore the original original_click_limit value if it was changed
            IF NEW.original_click_limit IS DISTINCT FROM OLD.original_click_limit THEN
              RAISE WARNING 'Preventing automatic update to original_click_limit (from % to %) for URL %', 
                OLD.original_click_limit, NEW.original_click_limit, NEW.id;
              NEW.original_click_limit := OLD.original_click_limit;
            END IF;
          END IF;
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Create a function that prevents automatic updates to click values in campaigns
      await db.execute(`
        CREATE OR REPLACE FUNCTION prevent_campaign_auto_click_updates()
        RETURNS TRIGGER AS $$
        BEGIN
          -- If this is an automatic sync operation
          IF click_protection_enabled() AND is_auto_sync() THEN
            -- Restore the original total_clicks value if it was changed
            IF NEW.total_clicks IS DISTINCT FROM OLD.total_clicks THEN
              RAISE WARNING 'Preventing automatic update to total_clicks (from % to %) for campaign %', 
                OLD.total_clicks, NEW.total_clicks, NEW.id;
              NEW.total_clicks := OLD.total_clicks;
            END IF;
          END IF;
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Drop existing triggers if they exist (for idempotency)
      await db.execute(`
        DROP TRIGGER IF EXISTS prevent_auto_click_update_trigger ON urls
      `);
      
      await db.execute(`
        DROP TRIGGER IF EXISTS prevent_campaign_auto_click_update_trigger ON campaigns
      `);

      // Create the trigger for URLs
      await db.execute(`
        CREATE TRIGGER prevent_auto_click_update_trigger
        BEFORE UPDATE ON urls
        FOR EACH ROW
        EXECUTE FUNCTION prevent_auto_click_updates()
      `);

      // Create the trigger for campaigns
      await db.execute(`
        CREATE TRIGGER prevent_campaign_auto_click_update_trigger
        BEFORE UPDATE ON campaigns
        FOR EACH ROW
        EXECUTE FUNCTION prevent_campaign_auto_click_updates()
      `);

      // Check if the triggers were created
      const urlTriggersResult = await db.execute(`
        SELECT COUNT(*) AS count FROM pg_trigger 
        WHERE tgname = 'prevent_auto_click_update_trigger'
      `);
      
      const campaignTriggersResult = await db.execute(`
        SELECT COUNT(*) AS count FROM pg_trigger 
        WHERE tgname = 'prevent_campaign_auto_click_update_trigger'
      `);
      
      // Extract count values safely with fallback to 0
      const urlTriggers = parseInt(urlTriggersResult[0]?.count || '0');
      const campaignTriggers = parseInt(campaignTriggersResult[0]?.count || '0');

      if (urlTriggers > 0 && campaignTriggers > 0) {
        return res.json({
          success: true,
          message: "Click protection installed successfully!",
          details: {
            urlTriggers: urlTriggers,
            campaignTriggers: campaignTriggers
          }
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Failed to install click protection - triggers not found",
          details: {
            urlTriggers: urlTriggers,
            campaignTriggers: campaignTriggers
          }
        });
      }
    } catch (error) {
      console.error('Error applying click protection:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to apply click protection", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Simple API route to test click protection
  app.post("/api/system/click-protection/simple-test", async (_req: Request, res: Response) => {
    try {
      console.log('Starting Simple Click Protection Test');
      
      // First check if click protection is enabled
      const protectionSetting = await db.execute(`
        SELECT value FROM protection_settings WHERE key = 'click_protection_enabled'
      `);
      
      const protectionEnabled = protectionSetting.length > 0 && (protectionSetting[0].value === true || protectionSetting[0].value === 't');
      console.log(`Click protection is ${protectionEnabled ? 'enabled' : 'disabled'}`);

      if (!protectionEnabled) {
        await db.execute(`
          INSERT INTO protection_settings (key, value)
          VALUES ('click_protection_enabled', TRUE)
          ON CONFLICT (key) DO UPDATE SET value = TRUE
        `);
        console.log('Click protection enabled for testing');
      }
      
      // Create a test table for this test only
      console.log('Creating test table for click protection testing');
      
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS click_protection_test (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            clicks INTEGER NOT NULL DEFAULT 0
          )
        `);
        
        // Create a specific trigger function for our test table - separate the function creation
        await db.execute(`
          -- First create a specific trigger function for the test table
          CREATE OR REPLACE FUNCTION prevent_test_auto_clicks_updates()
          RETURNS TRIGGER AS $$
          BEGIN
            -- If we're in an auto-sync context and someone is trying to change the clicks value,
            -- reject the update by returning NULL
            IF (is_auto_sync() AND NEW.clicks IS DISTINCT FROM OLD.clicks) THEN
              RAISE NOTICE 'Blocked auto-update of clicks: % -> %', OLD.clicks, NEW.clicks;
              RETURN NULL;
            END IF;
            
            -- For any other case, allow the update
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `);
        
        // Now create the trigger
        await db.execute(`
          -- Drop the trigger if it already exists
          DROP TRIGGER IF EXISTS prevent_test_auto_click_update_trigger ON click_protection_test;
          
          -- Create the trigger using our specific test function
          CREATE TRIGGER prevent_test_auto_click_update_trigger
          BEFORE UPDATE ON click_protection_test
          FOR EACH ROW
          EXECUTE FUNCTION prevent_test_auto_clicks_updates();
        `);
        
        console.log('Created test table and trigger for click protection testing');
      } catch (err) {
        console.error('Error creating test table or trigger:', err);
        throw err;
      }
      
      // Insert a test record
      await db.execute(`
        INSERT INTO click_protection_test (name, clicks)
        VALUES ('Test Record', 100)
        ON CONFLICT DO NOTHING
      `);
      
      // Get the test record
      console.log('Getting test record from test table');
      const testRecords = await db.execute(`
        SELECT id, name, clicks FROM click_protection_test LIMIT 1
      `);
      
      console.log('Test records result:', JSON.stringify(testRecords));
      
      // PostgreSQL results come back differently from the node-postgres driver
      if (!testRecords || !testRecords.rows || testRecords.rows.length === 0) {
        return res.status(500).json({
          success: false,
          message: "Failed to create test record"
        });
      }
      
      console.log('First record:', JSON.stringify(testRecords.rows[0]));
      const testRecord = testRecords.rows[0];
      
      if (!testRecord.id) {
        console.error('Test record does not have an id property');
        console.log('Test record properties:', Object.keys(testRecord));
        return res.status(500).json({
          success: false,
          message: "Test record is missing id property",
          details: { 
            record: testRecord,
            properties: Object.keys(testRecord)
          }
        });
      }
      
      const testRecordId = testRecord.id;
      
      console.log(`Test record: ${testRecord.name} (ID: ${testRecordId})`);
      console.log(`  - Current clicks: ${testRecord.clicks}`);
      
      // Test 1: Manual update (should succeed)
      console.log('\nTest 1: Manual update (should succeed)');
      const newClicks = testRecord.clicks + 50;
      
      await db.execute(`
        UPDATE click_protection_test
        SET clicks = ${newClicks}
        WHERE id = ${testRecordId}
      `);
      
      // Check if the update was successful
      const updatedRecords = await db.execute(`
        SELECT id, name, clicks FROM click_protection_test WHERE id = ${testRecordId}
      `);
      
      console.log('Updated records result:', JSON.stringify(updatedRecords));
      const updatedRecord = updatedRecords.rows[0];
      const manualUpdateSucceeded = updatedRecord.clicks === newClicks;
      
      console.log(`Manual update result: ${manualUpdateSucceeded ? 'SUCCESS' : 'FAILED'}`);
      console.log(`  - New clicks value: ${updatedRecord.clicks}`);
      
      // Test 2: Start an auto-sync context and try to update
      console.log('\nTest 2: Auto-sync update (should be blocked if protection is working)');
      
      // Get the current click value
      const currentClicks = updatedRecord.clicks;
      
      // Define a massive new value (like what happens in the bug)
      const autoSyncClicks = 1947542743;  // This is similar to the extreme values seen in the bug
      
      // Begin auto-sync context
      const syncOpResult = await db.execute(`SELECT start_auto_sync() AS operation_id`);
      console.log('Sync operation result:', JSON.stringify(syncOpResult));
      const syncOperationId = syncOpResult.rows[0].operation_id;
      
      try {
        console.log(`Starting auto-sync operation ID: ${syncOperationId}`);
        console.log(`Attempting to update clicks from ${currentClicks} to ${autoSyncClicks}`);
        
        // Try to update with a massive value within auto-sync context
        await db.execute(`
          UPDATE click_protection_test
          SET clicks = ${autoSyncClicks}
          WHERE id = ${testRecordId}
        `);
      } finally {
        // Always end the auto-sync operation
        await db.execute(`SELECT end_auto_sync(${syncOperationId})`);
        console.log('Auto-sync operation ended');
      }
      
      // Check if the protection blocked the update
      const finalRecords = await db.execute(`
        SELECT id, name, clicks FROM click_protection_test WHERE id = ${testRecordId}
      `);
      
      console.log('Final records result:', JSON.stringify(finalRecords));
      const finalRecord = finalRecords.rows[0];
      const autoUpdateBlocked = finalRecord.clicks !== autoSyncClicks;
      
      console.log(`Auto-sync update blocked: ${autoUpdateBlocked ? 'YES (Good)' : 'NO (Bad)'}`);
      console.log(`  - Final clicks value: ${finalRecord.clicks}`);
      
      return res.json({
        success: true,
        clickProtectionEnabled: protectionEnabled,
        testResults: {
          manualUpdateSucceeded,
          autoUpdateBlocked,
          overallProtectionWorking: manualUpdateSucceeded && autoUpdateBlocked
        },
        details: {
          initialClicks: testRecord.clicks,
          afterManualUpdate: updatedRecord.clicks,
          attemptedAutoSyncClicks: autoSyncClicks,
          finalClicks: finalRecord.clicks
        }
      });
    } catch (error) {
      console.error('Error testing click protection:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to test click protection", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // API route to test click protection
  app.post("/api/system/click-protection/test", async (_req: Request, res: Response) => {
    try {
      console.log('Starting Click Protection Test');

      // First check if click protection is enabled
      const protectionSetting = await db.execute(`
        SELECT value FROM protection_settings WHERE key = 'click_protection_enabled'
      `);
      
      const protectionEnabled = protectionSetting.length > 0 && (protectionSetting[0].value === true || protectionSetting[0].value === 't');
      console.log(`Click protection is ${protectionEnabled ? 'enabled' : 'disabled'}`);

      if (!protectionEnabled) {
        await db.execute(`
          INSERT INTO protection_settings (key, value)
          VALUES ('click_protection_enabled', TRUE)
          ON CONFLICT (key) DO UPDATE SET value = TRUE
        `);
        console.log('Click protection enabled for testing');
      }

      // Test 1: Manual update (should succeed)
      console.log('\nTest 1: Manual update (should succeed)');
      
      // Check if campaigns table has entries first
      const campaignsCheck = await db.execute(`
        SELECT id FROM campaigns LIMIT 1
      `);
      
      console.log('Campaigns check result:', JSON.stringify(campaignsCheck));
      
      if (campaignsCheck.length === 0) {
        console.log('No campaigns found. Creating a test campaign...');
        await db.execute(`
          INSERT INTO campaigns (name, redirect_domain, created_at, updated_at, redirect_method)
          VALUES ('Test Campaign', 'example.com', NOW(), NOW(), 'http_307')
        `);
        
        console.log('Test campaign created');
      }
      
      // Get campaign ID for the test URL
      const campaigns = await db.execute(`
        SELECT id FROM campaigns ORDER BY id ASC LIMIT 1
      `);
      
      console.log('Available campaigns:', JSON.stringify(campaigns));
      
      if (campaigns.length === 0) {
        return res.status(500).json({ 
          success: false,
          message: "Failed to get campaigns",
          error: "No campaigns found"
        });
      }
      
      const campaignId = campaigns[0].id;
      console.log(`Selected campaign ID: ${campaignId}`);
      console.log(`Using campaign ID: ${campaignId} for test`);
      
      // Now look for a URL to test with
      const testUrls = await db.execute(`
        SELECT id, name, clicks, click_limit 
        FROM urls 
        LIMIT 1
      `);

      let testUrl;
      if (testUrls.length === 0) {
        console.log('No URLs found for testing. Creating a test URL...');
        await db.execute(`
          INSERT INTO urls (name, target_url, campaign_id, clicks, click_limit, original_click_limit, status)
          VALUES ('Test URL', 'https://example.com', ${campaignId}, 0, 100, 100, 'active')
        `);
        
        const newUrls = await db.execute(`
          SELECT id, name, clicks, click_limit 
          FROM urls 
          ORDER BY id DESC
          LIMIT 1
        `);
        
        if (newUrls.length === 0) {
          return res.status(500).json({ 
            success: false,
            message: "Failed to create test URL",
            error: "Could not create test URL"
          });
        }
        
        testUrl = newUrls[0];
      } else {
        testUrl = testUrls[0];
      }

      console.log(`Test URL: ${testUrl.name} (ID: ${testUrl.id})`);
      console.log(`  - Current clicks: ${testUrl.clicks}`);
      console.log(`  - Click limit: ${testUrl.click_limit}`);
      
      // Update the click value manually
      const newClickLimit = testUrl.click_limit + 50;
      await db.execute(`
        UPDATE urls
        SET click_limit = ${newClickLimit}
        WHERE id = ${testUrl.id}
      `);
      
      // Check if the update was successful
      const updatedUrl = await db.execute(`
        SELECT id, name, clicks, click_limit 
        FROM urls 
        WHERE id = ${testUrl.id}
      `);
      
      const manualUpdateSucceeded = updatedUrl[0].click_limit === newClickLimit;

      // Test 2: Automatic update within sync context (should be blocked)
      console.log('\nTest 2: Automatic update (should be blocked)');
      
      // Try to update the click value automatically (within auto-sync context)
      const autoClickLimit = updatedUrl[0].click_limit + 1000000;
      
      console.log(`Attempting to auto-update click limit to ${autoClickLimit} (should be blocked)...`);
      
      // Start a new auto-sync operation
      const syncOpResult = await db.execute(`SELECT start_auto_sync() AS operation_id`);
      const syncOperationId = syncOpResult[0].operation_id;
      
      try {
        await db.execute(`
          UPDATE urls
          SET click_limit = ${autoClickLimit}
          WHERE id = ${testUrl.id}
        `);
      } finally {
        // Always end the auto-sync operation
        await db.execute(`SELECT end_auto_sync(${syncOperationId})`);
      }
      
      // Check if the update was blocked
      const finalUrl = await db.execute(`
        SELECT id, name, clicks, click_limit 
        FROM urls 
        WHERE id = ${testUrl.id}
      `);
      
      const autoUpdateBlocked = finalUrl[0].click_limit !== autoClickLimit;

      return res.json({
        success: true,
        protectionEnabled,
        testUrl: {
          id: testUrl.id,
          name: testUrl.name,
          initialClickLimit: testUrl.click_limit,
          manualUpdateClickLimit: newClickLimit,
          attemptedAutoUpdateClickLimit: autoClickLimit,
          finalClickLimit: finalUrl[0].click_limit
        },
        testResults: {
          manualUpdateSucceeded,
          autoUpdateBlocked,
          overallProtectionWorking: manualUpdateSucceeded && autoUpdateBlocked
        }
      });
    } catch (error) {
      console.error('Error testing click protection:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to test click protection", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // API route for campaigns
  app.get("/api/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ message: "Failed to fetch campaigns", error: error instanceof Error ? error.message : String(error) });
    }
  });
  
  // Get campaign by custom path
  app.get("/api/campaigns/path/:customPath", async (req: Request, res: Response) => {
    try {
      const customPath = req.params.customPath;
      if (!customPath) {
        return res.status(400).json({ message: "Invalid custom path" });
      }
      
      const campaign = await storage.getCampaignByCustomPath(customPath);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.get("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req: Request, res: Response) => {
    try {
      console.log('🔍 DEBUG: Campaign creation request received:', JSON.stringify(req.body, null, 2));
      
      // Parse and validate the input data
      const result = insertCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        console.log('🔍 DEBUG: Campaign validation failed:', validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Ensure multiplier is properly processed
      const campaignData = result.data;
      
      // Log the validated data
      console.log('🔍 DEBUG: Validated campaign data:', JSON.stringify(campaignData, null, 2));
      console.log('🔍 DEBUG: Multiplier type:', typeof campaignData.multiplier);
      console.log('🔍 DEBUG: Multiplier value:', campaignData.multiplier);
      
      // Create the campaign
      const campaign = await storage.createCampaign(campaignData);
      console.log('🔍 DEBUG: Campaign created successfully with ID:', campaign.id);
      
      res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });
  
  // Update an existing campaign
  app.put("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      console.log('🔍 DEBUG: Campaign update request received:', JSON.stringify(req.body, null, 2));
      console.log('🔍 DEBUG: Campaign update request TYPE:', typeof req.body.pricePerThousand);
      console.log('🔍 DEBUG: Campaign update request VALUE:', req.body.pricePerThousand);
      
      const result = updateCampaignSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        console.log('🔍 DEBUG: Campaign update validation failed:', validationError.message);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Check if multiplier is being updated
      const { multiplier } = result.data;
      const existingCampaign = await storage.getCampaign(id);
      
      if (!existingCampaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log('🔍 DEBUG: Campaign update requested: ID', id);
      
      // Handle multiplier data type conversions for comparison
      const oldMultiplierValue = typeof existingCampaign.multiplier === 'string'
        ? parseFloat(existingCampaign.multiplier)
        : (existingCampaign.multiplier || 1);
      
      const newMultiplierValue = multiplier !== undefined ? Number(multiplier) : oldMultiplierValue;
      
      console.log(`  - Current multiplier: ${oldMultiplierValue} (type: ${typeof oldMultiplierValue})`);
      console.log(`  - Requested multiplier: ${newMultiplierValue} (type: ${typeof newMultiplierValue})`);
      
      // Update campaign first
      const updatedCampaign = await storage.updateCampaign(id, result.data);
      
      // Check if multiplier actually changed (compare numeric values)
      const multiplierChanged = multiplier !== undefined && 
        Math.abs(oldMultiplierValue - newMultiplierValue) > 0.00001; // Floating point comparison with small epsilon
      
      if (multiplierChanged) {
        console.log(`🔍 DEBUG: Multiplier change detected: ${oldMultiplierValue} → ${newMultiplierValue}`);
        
        // Get all active/paused URLs
        const campaignUrls = await storage.getUrls(id);
        const activeOrPausedUrls = campaignUrls.filter(
          url => url.status === 'active' || url.status === 'paused'
        );
        
        console.log(`  - Found ${activeOrPausedUrls.length} active/paused URLs to update`);
        
        // Update each URL with new clickLimit based on original value * new multiplier
        for (const url of activeOrPausedUrls) {
          // When multiplier changes, only update the clickLimit based on originalClickLimit
          // The originalClickLimit remains unchanged (it's always the user's original input)
          const newClickLimit = Math.ceil(url.originalClickLimit * newMultiplierValue);
          
          console.log(`  - Updating URL ${url.id}: ${url.originalClickLimit} × ${newMultiplierValue} = ${newClickLimit}`);
          
          await storage.updateUrl(url.id, {
            clickLimit: newClickLimit, // Recalculate the click limit
            // Keep all other values unchanged
            originalClickLimit: url.originalClickLimit, // Original always stays the same
            name: url.name,
            targetUrl: url.targetUrl,
            status: url.status as 'active' | 'paused' | 'completed' | 'deleted' | 'rejected' | undefined
          });
        }
      } else {
        console.log('🔍 DEBUG: No multiplier change detected, skipping URL updates');
      }
      
      res.json(updatedCampaign);
    } catch (error) {
      console.error('Failed to update campaign:', error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });
  
  // Delete a campaign and mark all its URLs as deleted
  app.delete("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      const campaign = await storage.getCampaign(id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      // Delete the campaign and all its URLs
      const deleted = await storage.deleteCampaign(id);
      
      if (deleted) {
        res.status(200).json({ message: "Campaign deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete campaign" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // API routes for URLs
  app.get("/api/campaigns/:campaignId/urls", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const urls = await storage.getUrls(campaignId);
      res.json(urls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch URLs" });
    }
  });

  app.post("/api/campaigns/:campaignId/urls", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      console.log('🔍 DEBUG: Received URL creation request:', JSON.stringify(req.body, null, 2));
      console.log('🔍 DEBUG: Campaign multiplier:', campaign.multiplier);
      
      // Store original click limit - EXACTLY as entered by user
      const originalClickLimit = parseInt(req.body.clickLimit, 10);
      if (isNaN(originalClickLimit) || originalClickLimit <= 0) {
        return res.status(400).json({ message: "Click limit must be a positive number" });
      }
      console.log('🔍 DEBUG: Original click limit (user input):', originalClickLimit);
      
      // Calculate click limit with multiplier
      let calculatedClickLimit = originalClickLimit;
      if (campaign.multiplier) {
        // Convert multiplier to number if it's a string
        const multiplierValue = typeof campaign.multiplier === 'string' 
          ? parseFloat(campaign.multiplier) 
          : campaign.multiplier;
        
        // Apply multiplier if greater than 0.01
        if (multiplierValue > 0.01) {
          calculatedClickLimit = Math.ceil(originalClickLimit * multiplierValue);
          console.log('🔍 DEBUG: Calculated click limit after multiplier:', calculatedClickLimit);
          console.log(`🔍 DEBUG: Calculation: ${originalClickLimit} × ${multiplierValue} = ${calculatedClickLimit}`);
        }
      }
      
      // Create the URL data object with both the calculated limit and original input
      let urlData = { 
        ...req.body, 
        campaignId,
        clickLimit: calculatedClickLimit,
        originalClickLimit: originalClickLimit // IMPORTANT: This is the raw user input value without multiplier
      };
      
      console.log('🔍 DEBUG: Final URL data to be saved:', JSON.stringify(urlData, null, 2));
      
      const result = insertUrlSchema.safeParse(urlData);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const url = await storage.createUrl(result.data);
      
      // If the URL was created but marked as rejected due to duplicate name,
      // we still return 201 Created but also include a message about the rejection
      if (url.status === 'rejected') {
        // Check if it's a numbered rejection (name contains #)
        if (url.name.includes('#')) {
          // Return success with warning about duplicate name and auto-numbering
          return res.status(201).json({ 
            ...url,
            __message: `URL "${req.body.name}" was auto-numbered due to duplicate name` 
          });
        } else {
          // First rejection - just return with warning
          return res.status(201).json({ 
            ...url,
            __message: `URL "${req.body.name}" was rejected due to duplicate name` 
          });
        }
      }
      
      // Track this URL for budget updates if it was created successfully and the campaign is linked to TrafficStar
      if (campaign.trafficstarCampaignId) {
        try {
          console.log(`URL created in campaign ${campaignId} with TrafficStar campaign ID ${campaign.trafficstarCampaignId}`);
          console.log(`Scheduling budget update for this URL in 10 minutes`);
          
          // Add to the pending URL budgets tracking
          await trafficStarService.trackNewUrlForBudgetUpdate(
            url.id,
            campaignId,
            campaign.trafficstarCampaignId,
            calculatedClickLimit,
            campaign.pricePerThousand || 1000
          );
          
          console.log(`URL budget tracking scheduled for URL ID ${url.id}`);
        } catch (error) {
          console.error(`Error scheduling URL budget update:`, error);
          // Don't fail the request - just log the error
        }
      }
      
      // Normal case - URL created successfully without duplication
      res.status(201).json(url);
    } catch (error) {
      console.error('Error creating URL:', error);
      res.status(500).json({ message: "Failed to create URL" });
    }
  });

  app.put("/api/urls/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      // Get existing URL to check its campaign multiplier
      const existingUrl = await storage.getUrl(id);
      if (!existingUrl) {
        return res.status(404).json({ message: "URL not found" });
      }

      // Check if this is a click limit update with new multiplier needed
      let updateData = { ...req.body };

      // If updating clickLimit and the URL belongs to a campaign
      if (updateData.clickLimit && existingUrl.campaignId) {
        console.log('🔍 DEBUG: URL edit - updating click limit');
        
        // Get campaign to check for multiplier
        const campaign = await storage.getCampaign(existingUrl.campaignId);
        if (campaign && campaign.multiplier) {
          // Convert multiplier to number if it's a string
          const multiplierValue = typeof campaign.multiplier === 'string'
            ? parseFloat(campaign.multiplier)
            : campaign.multiplier;
          
          // Apply multiplier if greater than 0.01
          if (multiplierValue > 0.01) {
            // Save the new originalClickLimit (user input)
            const newOriginalLimit = parseInt(updateData.clickLimit, 10);
            
            // Apply campaign multiplier to get the new required limit
            updateData.clickLimit = Math.ceil(newOriginalLimit * multiplierValue);
            updateData.originalClickLimit = newOriginalLimit;
            
            console.log('🔍 DEBUG: URL updated with new limits:');
            console.log(`  - Original user input: ${newOriginalLimit}`);
            console.log(`  - After multiplier (${multiplierValue}x): ${updateData.clickLimit}`);
            console.log(`  - Calculation: ${newOriginalLimit} × ${multiplierValue} = ${updateData.clickLimit}`);
          }
        }
      }

      const result = updateUrlSchema.safeParse(updateData);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const url = await storage.updateUrl(id, result.data);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      // If the click limit was updated and the campaign is linked to TrafficStar,
      // track the difference for budget update
      if (updateData.clickLimit && existingUrl.campaignId) {
        try {
          // Get the campaign to check if it's linked to TrafficStar
          const campaign = await storage.getCampaign(existingUrl.campaignId);
          if (campaign && campaign.trafficstarCampaignId) {
            console.log(`URL ${id} updated in campaign ${existingUrl.campaignId} with TrafficStar campaign ID ${campaign.trafficstarCampaignId}`);
            
            // Calculate the click limit difference (if positive)
            const clickDifference = updateData.clickLimit - existingUrl.clickLimit;
            if (clickDifference > 0) {
              console.log(`URL click limit increased by ${clickDifference} clicks`);
              console.log(`Scheduling budget update for this URL in 10 minutes`);
              
              // Add to the pending URL budgets tracking using only the difference
              await trafficStarService.trackNewUrlForBudgetUpdate(
                url.id,
                existingUrl.campaignId,
                campaign.trafficstarCampaignId,
                clickDifference, // Only track the additional clicks
                campaign.pricePerThousand || 1000
              );
              
              console.log(`URL budget tracking scheduled for URL ID ${url.id} with ${clickDifference} additional clicks`);
            } else {
              console.log(`URL click limit decreased or unchanged - no budget update needed`);
            }
          }
        } catch (error) {
          console.error(`Error scheduling URL budget update:`, error);
          // Don't fail the request - just log the error
        }
      }

      res.json(url);
    } catch (error) {
      console.error('Error updating URL:', error);
      res.status(500).json({ message: "Failed to update URL" });
    }
  });

  app.delete("/api/urls/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      const success = await storage.deleteUrl(id);
      if (!success) {
        return res.status(404).json({ message: "URL not found" });
      }

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete URL" });
    }
  });
  
  // Permanently delete a URL (hard delete)
  app.delete("/api/urls/:id/permanent", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }

      const success = await storage.permanentlyDeleteUrl(id);
      if (!success) {
        return res.status(404).json({ message: "URL not found" });
      }

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to permanently delete URL" });
    }
  });
  
  // Bulk URL actions (pause, activate, delete, etc.)
  app.post("/api/urls/bulk", async (req: Request, res: Response) => {
    try {
      const result = bulkUrlActionSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }
      
      const { urlIds, action } = result.data;
      
      if (!urlIds.length) {
        return res.status(400).json({ message: "No URL IDs provided" });
      }
      
      const success = await storage.bulkUpdateUrls(urlIds, action);
      if (!success) {
        return res.status(404).json({ message: "No valid URLs found" });
      }
      
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to perform bulk action" });
    }
  });
  
  // Get all URLs with pagination, search and filtering
  app.get("/api/urls", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;
      const status = req.query.status as string;
      
      const result = await storage.getAllUrls(page, limit, search, status);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch URLs" });
    }
  });

  // Redirect endpoint
  app.get("/r/:campaignId/:urlId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(campaignId) || isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid redirect parameters" });
      }

      // Get both the URL and the campaign
      const url = await storage.getUrl(urlId);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      if (url.campaignId !== campaignId) {
        return res.status(400).json({ message: "URL does not belong to this campaign" });
      }

      if (url.clicks >= url.clickLimit) {
        return res.status(410).json({ message: "This link has reached its click limit" });
      }

      // Get the campaign to determine the redirect method
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Increment click count 
      await storage.incrementUrlClicks(urlId);

      // Handle the redirect based on the campaign's redirect method
      const targetUrl = url.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect with no visible content
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // Double meta refresh redirect (redirects through an intermediary page)
          const bridgeUrl = `/r/bridge/${campaignId}/${urlId}`;
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${bridgeUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_307_temporary":
          // Ultra-fast HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          // Clear any existing headers that might slow down the response
          res.removeHeader('X-Powered-By');
          res.removeHeader('Connection');
          res.removeHeader('Transfer-Encoding');
          
          // Set minimal headers for the fastest possible HTTP/2 redirect
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send immediate response without any processing delay
          res.writeHead(307);
          res.end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // Bridge page for double meta refresh
  app.get("/r/bridge/:campaignId/:urlId", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.campaignId);
      const urlId = parseInt(req.params.urlId);
      
      if (isNaN(campaignId) || isNaN(urlId)) {
        return res.status(400).json({ message: "Invalid redirect parameters" });
      }

      const url = await storage.getUrl(urlId);
      if (!url) {
        return res.status(404).json({ message: "URL not found" });
      }

      // Second stage of double meta refresh - minimal content for speed
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta http-equiv="refresh" content="0;url=${url.targetUrl}">
            <title></title>
            <style>body{display:none}</style>
          </head>
          <body></body>
        </html>
      `);
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // Custom path URL access for campaigns
  app.get("/views/:customPath", async (req: Request, res: Response) => {
    try {
      const startTime = process.hrtime();
      const customPath = req.params.customPath;
      
      if (!customPath) {
        return res.status(400).json({ message: "Invalid custom path" });
      }
      
      console.log(`Processing custom path request for: ${customPath}`);
      
      // Get the campaign by custom path with fresh database lookup
      const campaign = await storage.getCampaignByCustomPath(customPath);
      if (!campaign) {
        console.log(`Campaign not found for custom path: ${customPath}`);
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log(`Found campaign ID ${campaign.id} for custom path: ${customPath}`);
      console.log(`Campaign has ${campaign.urls.length} total URLs`);
      console.log(`Campaign has ${campaign.urls.filter(url => url.isActive).length} active URLs`);
      
      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaign.id);
      
      // If no active URLs are available, show an error message
      if (!selectedUrl) {
        console.log(`No active URLs available for campaign ID ${campaign.id}`);
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      console.log(`Selected URL ID ${selectedUrl.id} (${selectedUrl.name}) for redirect`);
      
      // Increment click count
      await storage.incrementUrlClicks(selectedUrl.id);
      
      // Performance metrics
      const endTime = process.hrtime(startTime);
      const timeInMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      
      // Handle the redirect based on the campaign's redirect method
      const targetUrl = selectedUrl.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // For double meta refresh - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
                <script>
                  // Immediate redirect without any visible elements
                  window.location.href = "${targetUrl}";
                </script>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\":443\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          
          // Add standard headers used by HTTP/2 servers
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
          
          // Add server identification to match pattern
          res.setHeader("X-Powered-By", "ViralEngine/2.0");
          
          // Send 307 redirect with HTTP/2 mimicking headers
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_forced_307":
          // This implementation matches the exact format seen in viralplayer.xyz
          // First, set all headers exactly in the same order as the reference implementation
          
          // Create a set-cookie that matches reference implementation format
          const cookieExpiration = new Date();
          cookieExpiration.setFullYear(cookieExpiration.getFullYear() + 1); // Expire in 1 year
          const cookieExpiryString = cookieExpiration.toUTCString();
          
          // Generate a random ID similar to viralplayer.xyz
          const randomId = Math.random().toString(16).substring(2, 10);
          
          // Set headers exactly matching viralplayer.xyz in their specific order
          res.removeHeader('X-Powered-By'); // Clear default Express headers
          res.setHeader("date", new Date().toUTCString());
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("server", "cloudflare");
          
          // Generate a UUID for x-request-id
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          res.setHeader("x-request-id", uuid);
          
          res.setHeader("cf-cache-status", "DYNAMIC");
          
          // Set cookies that match the format
          res.setHeader("set-cookie", [
            `bc45=fpc0|${randomId}::351:55209; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `rc45=fpc0|${randomId}::28; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `uclick=mr7ZxwtaaNs1gOWlamCY4hIUD7craeFLJuyMJz3hmBMFe4/9c70RDu5SgPFmEHXMW9DJfw==; SameSite=Lax; Max-Age=31536000`,
            `bcid=d0505amc402c73djlgl0; SameSite=Lax; Max-Age=31536000`
          ]);
          
          // Generate a random CF-Ray value
          const cfRay = Math.random().toString(16).substring(2, 11) + "a3fe-EWR";
          res.setHeader("cf-ray", cfRay);
          
          // Alt-Svc header for HTTP/3 protocol negotiation
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send 307 redirect
          res.status(307).end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });
  
  // High-performance campaign URL with optimized weighted distribution
  app.get("/c/:campaignId", async (req: Request, res: Response) => {
    try {
      const startTime = process.hrtime();
      const campaignId = parseInt(req.params.campaignId);
      
      if (isNaN(campaignId)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      console.log(`Processing campaign ID: ${campaignId}`);
      
      // Get the campaign to check if it exists - use fresh data 
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        console.log(`Campaign not found for ID: ${campaignId}`);
        return res.status(404).json({ message: "Campaign not found" });
      }
      
      console.log(`Found campaign ID ${campaign.id}`);
      console.log(`Campaign has ${campaign.urls.length} total URLs`);
      console.log(`Campaign has ${campaign.urls.filter(url => url.isActive).length} active URLs`);
      
      // Use our optimized method to get a URL based on weighted distribution
      const selectedUrl = await storage.getRandomWeightedUrl(campaignId);
      
      // If no active URLs are available, show an error
      if (!selectedUrl) {
        console.log(`No active URLs available for campaign ID ${campaignId}`);
        return res.status(410).json({ message: "All URLs in this campaign have reached their click limits" });
      }
      
      console.log(`Selected URL ID ${selectedUrl.id} (${selectedUrl.name}) for redirect`);
      
      // Redirect to the specific URL directly without going through the /r/ endpoint
      // This saves an extra HTTP redirect and improves performance
      
      // Increment click count first
      await storage.incrementUrlClicks(selectedUrl.id);
      
      // Performance metrics
      const endTime = process.hrtime(startTime);
      const timeInMs = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
      
      // Handle the redirect based on the campaign's redirect method
      const targetUrl = selectedUrl.targetUrl;
      
      switch (campaign.redirectMethod) {
        case "meta_refresh":
          // Meta refresh redirect - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "double_meta_refresh":
          // For double meta refresh - completely invisible
          res.send(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="0;url=${targetUrl}">
                <title></title>
                <style>body{display:none}</style>
                <script>
                  // Immediate redirect without any visible elements
                  window.location.href = "${targetUrl}";
                </script>
              </head>
              <body></body>
            </html>
          `);
          break;
          
        case "http_307":
          // HTTP 307 Temporary Redirect
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_307_temporary":
          // HTTP/2.0 307 Temporary Redirect (matching viralplayer.xyz implementation)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          
          // Note: True HTTP/2.0 requires HTTPS in production
          // These headers help indicate HTTP/2.0 intention
          res.setHeader("X-HTTP2-Version", "HTTP/2.0");
          res.setHeader("Alt-Svc", "h2=\":443\"; ma=86400");
          res.setHeader("X-Protocol-Version", "h2");
          
          // Add standard headers used by HTTP/2 servers
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
          
          // Add server identification to match pattern
          res.setHeader("X-Powered-By", "ViralEngine/2.0");
          
          // Send 307 redirect with HTTP/2 mimicking headers
          res.status(307).header("Location", targetUrl).end();
          break;
          
        case "http2_forced_307":
          // This implementation matches the exact format seen in viralplayer.xyz
          // First, set all headers exactly in the same order as the reference implementation
          
          // Create a set-cookie that matches reference implementation format
          const cookieExpiration = new Date();
          cookieExpiration.setFullYear(cookieExpiration.getFullYear() + 1); // Expire in 1 year
          const cookieExpiryString = cookieExpiration.toUTCString();
          
          // Generate a random ID similar to viralplayer.xyz
          const randomId = Math.random().toString(16).substring(2, 10);
          
          // Set headers exactly matching viralplayer.xyz in their specific order
          res.removeHeader('X-Powered-By'); // Clear default Express headers
          res.setHeader("date", new Date().toUTCString());
          res.setHeader("content-length", "0");
          res.setHeader("location", targetUrl);
          res.setHeader("server", "cloudflare");
          
          // Generate a UUID for x-request-id
          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
          res.setHeader("x-request-id", uuid);
          
          res.setHeader("cf-cache-status", "DYNAMIC");
          
          // Set cookies that match the format
          res.setHeader("set-cookie", [
            `bc45=fpc0|${randomId}::351:55209; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `rc45=fpc0|${randomId}::28; SameSite=Lax; Max-Age=31536000; Expires=${cookieExpiryString}`,
            `uclick=mr7ZxwtaaNs1gOWlamCY4hIUD7craeFLJuyMJz3hmBMFe4/9c70RDu5SgPFmEHXMW9DJfw==; SameSite=Lax; Max-Age=31536000`,
            `bcid=d0505amc402c73djlgl0; SameSite=Lax; Max-Age=31536000`
          ]);
          
          // Generate a random CF-Ray value
          const cfRay = Math.random().toString(16).substring(2, 11) + "a3fe-EWR";
          res.setHeader("cf-ray", cfRay);
          
          // Alt-Svc header for HTTP/3 protocol negotiation
          res.setHeader("alt-svc", "h3=\":443\"; ma=86400");
          
          // Send 307 redirect
          res.status(307).end();
          break;
          
        case "direct":
        default:
          // Standard redirect (302 Found)
          res.setHeader("X-Processing-Time", `${timeInMs}ms`);
          res.redirect(targetUrl);
          break;
      }
    } catch (error) {
      res.status(500).json({ message: "Redirect failed" });
    }
  });

  // Gmail Reader API endpoints
  const gmailConfigSchema = z.object({
    user: z.string().email(),
    password: z.string().min(1),
    host: z.string().default('imap.gmail.com'),
    port: z.number().int().positive().default(993),
    tls: z.boolean().default(true),
    tlsOptions: z.object({
      rejectUnauthorized: z.boolean()
    }).optional().default({ rejectUnauthorized: false }),
    whitelistSenders: z.array(z.string()).default([]),
    subjectPattern: z.string(),
    messagePattern: z.object({
      orderIdRegex: z.string(),
      urlRegex: z.string(),
      quantityRegex: z.string()
    }),
    defaultCampaignId: z.number().int().positive(),
    checkInterval: z.number().int().positive().default(60000),
    // Make sure auto-delete minutes is properly typed and validated
    autoDeleteMinutes: z.number().int().nonnegative().default(0).transform(val => 
      // Explicitly convert to number to handle string values from form submissions
      typeof val === 'string' ? parseInt(val, 10) : val
    )
  });

  // Get Gmail reader status
  app.get("/api/gmail-reader/status", (_req: Request, res: Response) => {
    try {
      const status = gmailReader.getStatus();
      
      // Make sure autoDeleteMinutes is explicitly included (in case it's undefined or not set)
      if (status.config && typeof status.config.autoDeleteMinutes !== 'number') {
        status.config.autoDeleteMinutes = 0; // Default value if not set
      }
      
      console.log('🔍 DEBUG: Returning Gmail status with autoDeleteMinutes:', 
                  status.config?.autoDeleteMinutes);
      
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to get Gmail reader status",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Configure Gmail reader
  app.post("/api/gmail-reader/config", async (req: Request, res: Response) => {
    try {
      // Convert string regex to RegExp objects
      const rawConfig = req.body;
      
      // Parse the input with basic validation
      const result = gmailConfigSchema.safeParse(rawConfig);
      
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Convert string patterns to RegExp objects
      const config = {
        ...result.data,
        subjectPattern: new RegExp(result.data.subjectPattern),
        messagePattern: {
          orderIdRegex: new RegExp(result.data.messagePattern.orderIdRegex),
          urlRegex: new RegExp(result.data.messagePattern.urlRegex),
          quantityRegex: new RegExp(result.data.messagePattern.quantityRegex)
        },
        // Ensure autoDeleteMinutes is explicitly set (and default to 0 if undefined)
        autoDeleteMinutes: typeof result.data.autoDeleteMinutes === 'number' 
          ? result.data.autoDeleteMinutes 
          : 0
      };
      
      console.log('🔍 DEBUG: Updating Gmail config with autoDeleteMinutes:', config.autoDeleteMinutes);
      
      // Check if the campaign exists
      const campaign = await storage.getCampaign(config.defaultCampaignId);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found for defaultCampaignId" });
      }
      
      // Update the Gmail reader configuration
      const updatedConfig = gmailReader.updateConfig(config);
      
      res.json({
        message: "Gmail reader configuration updated successfully",
        config: {
          ...updatedConfig,
          password: "******" // Hide password in response
        }
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to configure Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Test Gmail connection (using both SMTP and IMAP methods)
  app.post("/api/gmail-reader/test-connection", async (req: Request, res: Response) => {
    try {
      const { user, password, host = 'imap.gmail.com', port = 993, tls = true } = req.body;
      
      if (!user || !password) {
        return res.status(400).json({ 
          success: false,
          message: "Missing credentials. Please provide user and password."
        });
      }
      
      // First try SMTP verification (often more reliable with Gmail)
      // Get the current config to preserve important settings like autoDeleteMinutes
      const currentConfig = gmailReader.getStatus().config;
      
      // Create a temporary config that preserves important settings
      const tempConfig = {
        user,
        password,
        host,
        port, 
        tls,
        whitelistSenders: ['help@donot-reply.in'], // Include the requested whitelist
        autoDeleteMinutes: currentConfig?.autoDeleteMinutes || 0 // Preserve auto-delete setting
      };
      
      // Update the main Gmail reader with the credentials for testing
      gmailReader.updateConfig(tempConfig);
      
      try {
        // Try to verify using SMTP first (faster and more reliable for Gmail)
        const smtpResult = await gmailReader.verifyCredentials();
        if (smtpResult.success) {
          return res.json(smtpResult);
        }
        // If SMTP failed, fall back to IMAP verification
        console.log('SMTP verification failed, trying IMAP:', smtpResult.message);
      } catch (smtpError) {
        console.log('SMTP verification threw an error, trying IMAP:', smtpError);
      }
      
      // Fall back to IMAP connection testing
      // Create a new IMAP connection for testing
      const testImap = new Imap({
        user,
        password,
        host,
        port,
        tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 30000, // Increase auth timeout
        connTimeout: 30000  // Increase connection timeout
      });
      
      // Set up a promise to handle the connection test
      const connectionTest = new Promise<{success: boolean, message: string}>((resolve, reject) => {
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
          try {
            testImap.end();
          } catch (e) {
            // Ignore errors when ending the connection
          }
          resolve({ 
            success: false, 
            message: "Connection timeout. Please check your credentials and network. Gmail sometimes blocks automated login attempts. Try again later or visit your Google account security settings." 
          });
        }, 30000); // 30 second timeout
        
        // Handle errors
        testImap.once('error', (err: Error) => {
          clearTimeout(timeout);
          console.log('IMAP connection error:', err.message);
          
          // Parse the error message to provide more helpful feedback
          let friendlyMessage = `Connection failed: ${err.message}`;
          
          if (err.message.includes('Invalid credentials') || err.message.includes('Authentication failed')) {
            friendlyMessage = 'Authentication failed: Please check your email and app password. Make sure you\'re using an App Password if you have 2-factor authentication enabled.';
          } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
            friendlyMessage = 'Could not reach Gmail server: Please check your internet connection and host settings';
          } else if (err.message.includes('ETIMEDOUT')) {
            friendlyMessage = 'Connection timed out: Gmail server might be blocking the request or there are network issues. Try again later.';
          }
          
          resolve({ 
            success: false, 
            message: friendlyMessage
          });
        });
        
        // Handle successful connection
        testImap.once('ready', () => {
          clearTimeout(timeout);
          testImap.getBoxes((err, boxes) => {
            if (err) {
              resolve({ 
                success: true, 
                message: "Connected successfully, but couldn't list mailboxes." 
              });
            } else {
              resolve({ 
                success: true, 
                message: "Connected successfully! Gmail credentials are working." 
              });
            }
            
            // Close the connection
            try {
              testImap.end();
            } catch (e) {
              // Ignore errors when ending the connection
            }
          });
        });
        
        // Start the connection
        testImap.connect();
      });
      
      // Wait for the connection test to complete
      const result = await connectionTest;
      
      // Send the result
      res.json(result);
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: `Failed to test connection: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Start Gmail reader
  app.post("/api/gmail-reader/start", (_req: Request, res: Response) => {
    try {
      gmailReader.start();
      res.json({ message: "Gmail reader started successfully" });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to start Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Stop Gmail reader
  app.post("/api/gmail-reader/stop", (_req: Request, res: Response) => {
    try {
      gmailReader.stop();
      res.json({ message: "Gmail reader stopped successfully" });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to stop Gmail reader",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Clean up Gmail reader processed email logs by date
  app.post("/api/gmail-reader/cleanup-logs", (req: Request, res: Response) => {
    try {
      const { beforeDate, afterDate, daysToKeep } = req.body;
      
      // Parse dates if provided
      const options: { before?: Date, after?: Date, daysToKeep?: number } = {};
      
      if (beforeDate) {
        options.before = new Date(beforeDate);
      }
      
      if (afterDate) {
        options.after = new Date(afterDate);
      }
      
      if (daysToKeep) {
        options.daysToKeep = parseInt(daysToKeep, 10);
      }
      
      // Perform the cleanup
      const result = gmailReader.cleanupEmailLogsByDate(options);
      
      res.json({
        message: `Successfully cleaned up email logs: removed ${result.entriesRemoved}, kept ${result.entriesKept}`,
        ...result
      });
    } catch (error) {
      res.status(500).json({ 
        message: "Failed to clean up Gmail reader logs",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Reset Gmail tracking system (clear all processed email logs)
  app.post("/api/gmail-reader/reset-tracking", (_req: Request, res: Response) => {
    try {
      // Stop the Gmail reader first to clear any in-progress operations
      gmailReader.stop();
      
      // Clear all email logs
      const result = gmailReader.clearAllEmailLogs();
      
      // Restart with a clean state after a short delay
      setTimeout(() => {
        // Start Gmail reader again to force a fresh scan
        gmailReader.start();
        
        console.log('Gmail reader restarted with clean tracking state for fresh email scan');
      }, 2000);
      
      res.json({
        success: true,
        message: `Gmail tracking system reset successfully. Removed ${result.entriesRemoved} entries. Reader restarted to perform a complete fresh scan.`,
        details: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: `Error resetting Gmail tracking system: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
  
  // Full system cleanup endpoint
  app.post("/api/system/full-cleanup", async (req: Request, res: Response) => {
    try {
      const { confirmText } = req.body;
      
      // Safety check - require explicit confirmation
      if (confirmText !== "DELETE ALL DATA") {
        return res.status(400).json({
          message: "Confirmation failed. Please provide the correct confirmation text."
        });
      }
      
      // Stop Gmail reader first if it's running
      if (gmailReader.getStatus().isRunning) {
        gmailReader.stop();
      }
      
      // Clear email processing logs
      const emailLogsResult = gmailReader.clearAllEmailLogs();
      
      // Clear database (delete all campaigns and URLs)
      const dbResult = await storage.fullSystemCleanup();
      
      res.json({ 
        message: "Full system cleanup completed successfully", 
        result: {
          campaignsDeleted: dbResult.campaignsDeleted,
          urlsDeleted: dbResult.urlsDeleted,
          emailLogsCleared: emailLogsResult.success,
          emailLogsRemoved: emailLogsResult.entriesRemoved
        }
      });
    } catch (error) {
      console.error("Error performing full system cleanup:", error);
      res.status(500).json({ 
        message: "Failed to perform full system cleanup",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Database migration - update campaign multiplier to decimal type
  app.post("/api/system/migrate-decimal-multiplier", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { updateMultiplierToDecimal } = await import("./migrations/decimal-multiplier");
      
      // Execute the migration
      const result = await updateMultiplierToDecimal();
      
      if (result.success) {
        console.log("✅ Multiplier migration successful:", result.message);
        res.status(200).json({
          message: "Multiplier migration completed successfully",
          details: result.message
        });
      } else {
        console.error("❌ Multiplier migration failed:", result.message);
        res.status(500).json({
          message: "Multiplier migration failed",
          details: result.message
        });
      }
    } catch (error) {
      console.error("Failed to run multiplier migration:", error);
      res.status(500).json({ message: "Failed to run multiplier migration" });
    }
  });

  // TrafficStar API Routes

  // Check if TrafficStar API is configured (has API key)
  app.get("/api/trafficstar/status", async (_req: Request, res: Response) => {
    try {
      const isConfigured = await trafficStarService.isConfigured();
      res.json({ configured: isConfigured });
    } catch (error) {
      console.error('Error checking TrafficStar configuration:', error);
      res.status(500).json({ 
        message: "Failed to check TrafficStar configuration",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Save TrafficStar API key
  app.post("/api/trafficstar/config", async (req: Request, res: Response) => {
    try {
      const result = insertTrafficstarCredentialSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      await trafficStarService.saveApiKey(result.data.apiKey);
      res.json({ success: true, message: "TrafficStar API key saved successfully" });
    } catch (error) {
      console.error('Error saving TrafficStar API key:', error);
      res.status(500).json({ 
        message: "Failed to save TrafficStar API key",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get TrafficStar campaigns
  app.get("/api/trafficstar/campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await trafficStarService.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching TrafficStar campaigns:', error);
      res.status(500).json({ 
        message: "Failed to fetch TrafficStar campaigns",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get TrafficStar campaign by ID
  app.get("/api/trafficstar/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      const campaign = await trafficStarService.getCampaign(id);
      res.json(campaign);
    } catch (error) {
      console.error(`Error fetching TrafficStar campaign ${req.params.id}:`, error);
      res.status(500).json({ 
        message: `Failed to fetch TrafficStar campaign ${req.params.id}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Get TrafficStar campaign spent value
  app.get("/api/trafficstar/campaigns/:id/spent", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }
      
      // Get date range from query parameters
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateUntil = req.query.dateUntil as string | undefined;
      
      // Validate date format if provided (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateFrom && !dateRegex.test(dateFrom)) {
        return res.status(400).json({ message: "Invalid dateFrom format. Use YYYY-MM-DD" });
      }
      if (dateUntil && !dateRegex.test(dateUntil)) {
        return res.status(400).json({ message: "Invalid dateUntil format. Use YYYY-MM-DD" });
      }

      const stats = await trafficStarService.getCampaignSpentValue(id, dateFrom, dateUntil);
      res.json(stats);
    } catch (error) {
      console.error(`Error fetching spent value for TrafficStar campaign ${req.params.id}:`, error);
      res.status(500).json({ 
        message: `Failed to fetch spent value for TrafficStar campaign ${req.params.id}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get saved TrafficStar campaigns from database
  app.get("/api/trafficstar/saved-campaigns", async (_req: Request, res: Response) => {
    try {
      const campaigns = await trafficStarService.getSavedCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching saved TrafficStar campaigns:', error);
      res.status(500).json({ 
        message: "Failed to fetch saved TrafficStar campaigns",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Perform campaign action (pause/activate)
  app.post("/api/trafficstar/campaigns/action", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignActionSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, action } = result.data;

      // INSTANT DB UPDATE FIRST - Make the change instantly visible in the UI
      try {
        const targetActive = action === 'activate';
        const targetStatus = action === 'activate' ? 'enabled' : 'paused';
        
        // Update database first - this is what the user will see immediately
        await db.update(trafficstarCampaigns)
          .set({ 
            active: targetActive,
            status: targetStatus,
            lastRequestedAction: action,
            lastRequestedActionAt: new Date(),
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} ${action === 'pause' ? 'paused' : 'activated'} successfully`,
        statusChanged: true, // Always true since we updated DB first
        pendingSync: false, // Don't show pending status in UI
        lastRequestedAction: action,
        lastRequestedActionAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      // This way API delays won't affect the user experience
      setTimeout(() => {
        try {
          if (action === 'pause') {
            trafficStarService.pauseCampaign(campaignId)
              .catch(error => console.error(`Background API call to pause campaign ${campaignId} failed:`, error));
          } else if (action === 'activate') {
            trafficStarService.activateCampaign(campaignId)
              .catch(error => console.error(`Background API call to activate campaign ${campaignId} failed:`, error));
          }
        } catch (apiError) {
          console.error(`Error in background API operation for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error performing TrafficStar campaign action:', error);
      res.status(500).json({ 
        message: "Failed to perform TrafficStar campaign action",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update campaign daily budget
  app.post("/api/trafficstar/campaigns/budget", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignBudgetSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, maxDaily } = result.data;
      
      // Update database first for immediate UI response
      try {
        await db.update(trafficstarCampaigns)
          .set({ 
            maxDaily: maxDaily.toString(), // Convert to string for DB numeric type
            lastBudgetUpdate: new Date(),
            lastBudgetUpdateValue: maxDaily.toString(), // Store the exact value we're setting
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign budget ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} budget updated to ${maxDaily} successfully`,
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      setTimeout(() => {
        try {
          trafficStarService.updateCampaignDailyBudget(campaignId, maxDaily)
            .catch(error => console.error(`Background API call to update budget for campaign ${campaignId} failed:`, error));
            
          // Refresh campaign in background
          trafficStarService.getCampaign(campaignId)
            .catch(error => console.error(`Background API call to refresh campaign ${campaignId} failed:`, error));
        } catch (apiError) {
          console.error(`Error in background budget update for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error updating TrafficStar campaign budget:', error);
      res.status(500).json({ 
        message: "Failed to update TrafficStar campaign budget",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Force immediate budget update for a campaign (used when budget update time changes)
  app.post("/api/trafficstar/campaigns/force-budget-update", async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId || isNaN(Number(campaignId))) {
        return res.status(400).json({ message: "Invalid campaign ID" });
      }

      // Get campaign from database
      const campaign = await storage.getCampaign(Number(campaignId));
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Only process if TrafficStar integration is enabled
      if (!campaign.trafficstarCampaignId || !campaign.autoManageTrafficstar) {
        return res.status(400).json({ 
          message: "Cannot force budget update: TrafficStar integration not enabled for this campaign" 
        });
      }

      // Manually trigger auto-management for this campaign
      console.log(`🔄 Forcing immediate TrafficStar budget update for campaign ${campaignId}`);
      
      try {
        // Set daily budget to $10.15 via TrafficStar API
        await trafficStarService.updateCampaignDailyBudget(
          Number(campaign.trafficstarCampaignId), 
          10.15
        );
        
        // Update last sync time in campaigns table
        await db.update(campaigns)
          .set({
            lastTrafficstarSync: new Date(),
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, Number(campaignId)));
          
        return res.json({ 
          success: true, 
          message: `Budget for campaign ${campaignId} updated to $10.15 successfully`,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error forcing budget update for campaign ${campaignId}:`, error);
        return res.status(500).json({ 
          success: false,
          message: "Failed to force budget update",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } catch (error) {
      console.error('Error forcing TrafficStar budget update:', error);
      res.status(500).json({ 
        message: "Failed to force TrafficStar budget update",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update campaign end time
  app.post("/api/trafficstar/campaigns/end-time", async (req: Request, res: Response) => {
    try {
      const result = trafficstarCampaignEndTimeSchema.safeParse(req.body);
      if (!result.success) {
        const validationError = fromZodError(result.error);
        return res.status(400).json({ message: validationError.message });
      }

      const { campaignId, scheduleEndTime } = result.data;
      
      // Update database first for immediate UI response
      try {
        await db.update(trafficstarCampaigns)
          .set({ 
            scheduleEndTime: scheduleEndTime,
            lastEndTimeUpdate: new Date(),
            lastEndTimeUpdateValue: scheduleEndTime, // Store the exact value we're setting
            updatedAt: new Date() 
          })
          .where(eq(trafficstarCampaigns.trafficstarId, campaignId.toString()));
      } catch (dbError) {
        console.error(`Error updating campaign end time ${campaignId} in database: ${dbError}`);
        // Continue even if there's an error, as the API call might still work
      }
      
      // IMMEDIATE RESPONSE - Respond to user right away
      res.json({ 
        success: true, 
        message: `Campaign ${campaignId} end time updated to ${scheduleEndTime} successfully`,
        timestamp: new Date().toISOString()
      });
      
      // BACKGROUND API CALL - Process API call after response is sent
      setTimeout(() => {
        try {
          trafficStarService.updateCampaignEndTime(campaignId, scheduleEndTime)
            .catch(error => console.error(`Background API call to update end time for campaign ${campaignId} failed:`, error));
            
          // Refresh campaign in background
          trafficStarService.getCampaign(campaignId)
            .catch(error => console.error(`Background API call to refresh campaign ${campaignId} failed:`, error));
        } catch (apiError) {
          console.error(`Error in background end time update for campaign ${campaignId}:`, apiError);
          // Error in background process - already responded to user, so just log it
        }
      }, 100); // Start background processing after a small delay
    } catch (error) {
      console.error('Error updating TrafficStar campaign end time:', error);
      res.status(500).json({ 
        message: "Failed to update TrafficStar campaign end time",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Database migration - add TrafficStar fields to campaigns table
  app.post("/api/system/migrate-trafficstar-fields", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { addTrafficStarFields } = await import("./migrations/add-trafficstar-fields");
      
      // Execute the migration
      const result = await addTrafficStarFields();
      
      if (result.success) {
        console.log("✅ TrafficStar fields migration successful:", result.message);
        res.status(200).json({
          message: "TrafficStar fields migration completed successfully",
          details: result.message
        });
      } else {
        console.error("❌ TrafficStar fields migration failed:", result.message);
        res.status(500).json({
          message: "TrafficStar fields migration failed",
          details: result.message
        });
      }
    } catch (error) {
      console.error("Failed to add TrafficStar fields:", error);
      res.status(500).json({ message: "Failed to add TrafficStar fields to campaigns table" });
    }
  });
  
  // Check migration status - Find out if migrations are needed
  app.get("/api/system/check-migrations", async (_req: Request, res: Response) => {
    try {
      // Import the migration check functions
      const { 
        isBudgetUpdateTimeMigrationNeeded, 
        isTrafficStarFieldsMigrationNeeded 
      } = await import("./migrations/check-migration-needed");
      
      // Check migration status
      const budgetUpdateTimeMigrationNeeded = await isBudgetUpdateTimeMigrationNeeded();
      const trafficStarFieldsMigrationNeeded = await isTrafficStarFieldsMigrationNeeded();
      
      // Return migration status
      res.status(200).json({
        budgetUpdateTimeMigrationNeeded,
        trafficStarFieldsMigrationNeeded,
        migrationNeeded: budgetUpdateTimeMigrationNeeded || trafficStarFieldsMigrationNeeded,
        message: "Migration status checked successfully"
      });
    } catch (error) {
      console.error("Failed to check migration status:", error);
      res.status(500).json({ 
        message: "Failed to check migration status", 
        error: error instanceof Error ? error.message : String(error),
        // Assume migrations are needed if check fails
        migrationNeeded: true,
        budgetUpdateTimeMigrationNeeded: true,
        trafficStarFieldsMigrationNeeded: true
      });
    }
  });

  // Database migration - add budget update time field to campaigns table
  app.post("/api/system/migrate-budget-update-time", async (_req: Request, res: Response) => {
    try {
      // Import the migration function
      const { addBudgetUpdateTimeField } = await import("./migrations/add-budget-update-time");
      
      // Execute the migration
      const result = await addBudgetUpdateTimeField();
      
      if (result.success) {
        console.log("✅ Budget update time field migration successful");
        res.status(200).json({
          message: "Budget update time field migration completed successfully"
        });
      } else {
        console.error("❌ Budget update time field migration failed:", result.error);
        res.status(500).json({
          message: "Budget update time field migration failed",
          error: result.error
        });
      }
    } catch (error) {
      console.error("Failed to add budget update time field:", error);
      res.status(500).json({ message: "Failed to add budget update time field to campaigns table" });
    }
  });
  
  /**
   * Test route for verifying the budget adjustment feature after 10-minute spent value pause
   * This simulates the process of recalculating the budget after a campaign has been paused
   * due to exceeding the $10 daily spent value threshold.
   */
  app.post("/api/system/test-budget-adjustment", async (_req: Request, res: Response) => {
    // Reset test variables first to ensure clean state
    process.env.TEST_MODE = 'false';
    process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
    delete process.env.TEST_CAMPAIGN_ID;
    delete process.env.TEST_PAUSE_TIME;
    delete process.env.TEST_RECHECK_TIME;
    delete process.env.TEST_UTC_DATE;
    
    try {
      console.log('🧪 TEST: Budget Adjustment After Spent Value Pause');
      
      // Get a campaign with auto-management enabled
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.autoManageTrafficstar, true));
      
      if (!campaign) {
        return res.json({
          success: false,
          message: 'No auto-managed campaign found for testing'
        });
      }
      
      console.log(`Found campaign ${campaign.id} for testing`);
      
      if (!campaign.trafficstarCampaignId) {
        return res.json({
          success: false,
          message: 'Campaign does not have TrafficStar ID'
        });
      }
      
      const trafficstarId = Number(campaign.trafficstarCampaignId);
      
      // 1. Manually trigger the budget adjustment process
      console.log(`Manually triggering budget adjustment process for campaign ${trafficstarId}`);
      
      // Get current UTC date
      const currentUtcDate = new Date().toISOString().split('T')[0];
      
      // Create a pause state in the past (10 min ago)
      const pausedAt = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
      const recheckAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago (so it's ready for recheck)
      
      // We need to simulate a pause due to spent value
      // Since spentValuePausedCampaigns is private in the service,
      // let's directly adjust the date and run the auto-management to test
      
      // First, pause the campaign to simulate spent value pause
      await trafficStarService.pauseCampaign(trafficstarId);
      
      // Then we'll activate the test mode to simulate a pause that happened in the past
      process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'true';
      process.env.TEST_CAMPAIGN_ID = trafficstarId.toString();
      process.env.TEST_PAUSE_TIME = pausedAt.toISOString();
      process.env.TEST_RECHECK_TIME = recheckAt.toISOString();
      process.env.TEST_UTC_DATE = currentUtcDate;
      
      console.log(`Set pause info for campaign ${trafficstarId} with recheck time in the past`);
      
      // Make sure we have some URLs with clicks
      const existingUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.campaignId, campaign.id));
      
      if (existingUrls.length === 0) {
        // Create a test URL
        await db.insert(urls).values({
          campaignId: campaign.id,
          name: 'Test URL for Budget Adjustment',
          targetUrl: 'https://example.com/test',
          clickLimit: 5000,
          clicks: 0,
          status: 'active',
          originalClickLimit: 5000,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log('Created test URL with 5000 clicks for budget adjustment test');
      } else {
        // Update existing URLs to be active with clicks
        await db.update(urls)
          .set({
            clickLimit: 5000,
            clicks: 0,
            status: 'active',
            updatedAt: new Date()
          })
          .where(eq(urls.campaignId, campaign.id));
          
        console.log('Updated existing URLs to be active with 5000 clicks');
      }
      
      // 2. Enable test mode to simulate spent value
      process.env.TEST_MODE = 'true';
      
      // 3. Trigger the spent value check, which should detect the recheck time has passed
      //    and invoke the budget adjustment process
      console.log('Running spent value check to trigger budget adjustment...');
      await trafficStarService.checkCampaignsSpentValue();
      
      // Calculate pending click pricing and other data for the UI
      const activeUrls = await db
        .select()
        .from(urls)
        .where(
          and(
            eq(urls.campaignId, campaign.id),
            eq(urls.status, 'active')
          )
        );
      
      const activeUrlsCount = activeUrls.length;
      
      // Calculate total click capacity
      let totalClickCapacity = 0;
      activeUrls.forEach(url => {
        totalClickCapacity += url.clickLimit || 0;
      });
      
      // Calculate pricing using pricePerThousand or a default
      const pricePerThousand = parseFloat(campaign.pricePerThousand?.toString() || '1000.00');
      const pendingClickPricing = (totalClickCapacity / 1000) * pricePerThousand;
      
      // Use a simulated current spent value of $10.30 (test mode will enforce this)
      const currentSpentValue = 10.30;
      
      // Calculate new daily budget
      const newDailyBudget = currentSpentValue + pendingClickPricing;
      
      // Format end date time (current UTC date 23:59)
      const endDateObj = new Date();
      endDateObj.setUTCHours(23, 59, 0, 0);
      const formattedEndDate = endDateObj.toISOString().split('T')[0];
      const formattedEndTime = endDateObj.toISOString().split('T')[1].substring(0, 5);
      const newEndDateTime = `${formattedEndDate} ${formattedEndTime}`;
      
      // Get current status
      const currentStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
      const finalStatus = currentStatus?.active ? "Active" : "Paused";
      
      // 4. Clean up
      process.env.TEST_MODE = 'false';
      process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
      delete process.env.TEST_CAMPAIGN_ID;
      delete process.env.TEST_PAUSE_TIME;
      delete process.env.TEST_RECHECK_TIME;
      delete process.env.TEST_UTC_DATE;
      
      // Return detailed test results for UI
      res.json({
        success: true,
        message: 'Budget adjustment test completed successfully',
        campaignId: campaign.id,
        trafficstarId,
        currentUtcDate,
        currentSpentValue,
        activeUrlsCount,
        totalClickCapacity,
        pendingClickPricing,
        newDailyBudget,
        newEndDateTime,
        finalStatus,
        testMode: true
      });
    } catch (error) {
      console.error('Error in test-budget-adjustment:', error);
      
      // Clean up test environment variables on error
      process.env.TEST_MODE = 'false';
      process.env.TEST_MODE_SPENT_VALUE_PAUSE = 'false';
      delete process.env.TEST_CAMPAIGN_ID;
      delete process.env.TEST_PAUSE_TIME;
      delete process.env.TEST_RECHECK_TIME;
      delete process.env.TEST_UTC_DATE;
      
      res.json({
        success: false,
        message: 'Error testing budget adjustment functionality',
        error: String(error)
      });
    }
  });
  
  /**
   * Comprehensive test route for verifying both click threshold and spent value monitoring functionality
   */
  app.post("/api/system/test-spent-value-monitoring", async (_req: Request, res: Response) => {
    try {
      // Temporarily set test mode environment variable
      process.env.TEST_MODE = 'true';
      
      // Get all campaigns with auto-management enabled
      const campaignsToCheck = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.autoManageTrafficstar, true),
            isNotNull(campaigns.trafficstarCampaignId)
          )
        );
      
      console.log(`TEST: Found ${campaignsToCheck.length} campaigns with auto-management enabled`);
      
      // Test URL counts - to verify click threshold functionality
      const urlCounts = await Promise.all(campaignsToCheck.map(async (campaign) => {
        // Get all active URLs for the campaign
        const activeUrls = await db
          .select()
          .from(urls)
          .where(
            and(
              eq(urls.campaignId, campaign.id),
              eq(urls.status, 'active')
            )
          );
        
        // Get all paused URLs for the campaign
        const pausedUrls = await db
          .select()
          .from(urls)
          .where(
            and(
              eq(urls.campaignId, campaign.id),
              eq(urls.status, 'paused')
            )
          );
        
        // Calculate total active clicks
        const activeClicksTotal = activeUrls.reduce((sum, url) => sum + (url.clickLimit - url.clicks), 0);
        
        return {
          campaignId: campaign.id,
          activeUrlCount: activeUrls.length,
          pausedUrlCount: pausedUrls.length,
          activeClicksRemaining: activeClicksTotal,
          // Would this campaign be activated/paused based on click threshold?
          wouldActivateByClicks: activeClicksTotal >= 15000,
          wouldPauseByClicks: activeClicksTotal <= 5000
        };
      }));
      
      // Manually run the spent value check function
      await trafficStarService.checkCampaignsSpentValue();
      
      // Check the results of the spent value check
      const results = await Promise.all(campaignsToCheck.map(async (campaign, index) => {
        if (!campaign.trafficstarCampaignId) return null;
        
        // Get TrafficStar campaign ID converted to number
        const trafficstarId = isNaN(Number(campaign.trafficstarCampaignId)) ? 
          parseInt(campaign.trafficstarCampaignId.replace(/\D/g, '')) : 
          Number(campaign.trafficstarCampaignId);
        
        // Get current date in UTC
        const currentUtcDate = new Date().toISOString().split('T')[0];
        
        // Get current status
        const [dbCampaign] = await db
          .select()
          .from(trafficstarCampaigns)
          .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId.toString()));
        
        // Get pause info from TrafficStar service
        const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, currentUtcDate);

        // Get spent value for today (this will return test mock data since we're in test mode)
        const spentValueData = await trafficStarService.getCampaignSpentValue(trafficstarId, currentUtcDate, currentUtcDate);
        
        // Get related URL count data
        const urlData = urlCounts[index];
        
        return {
          campaignId: campaign.id,
          trafficstarId,
          // TrafficStar status
          currentStatus: dbCampaign ? dbCampaign.status : 'unknown',
          isActive: dbCampaign ? dbCampaign.active : false,
          
          // Spent value data
          dailySpentValue: spentValueData?.totalSpent || 0,
          spentThresholdExceeded: (spentValueData?.totalSpent || 0) > 10,
          isPausedDueToSpentValue: Boolean(pauseInfo),
          spentValuePauseInfo: pauseInfo ? {
            pausedAt: pauseInfo.pausedAt.toISOString(),
            recheckAt: pauseInfo.recheckAt.toISOString(),
            minutesRemaining: Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000))
          } : null,
          
          // URL and click data
          urlData: urlData || {
            activeUrlCount: 0,
            pausedUrlCount: 0,
            activeClicksRemaining: 0,
            wouldActivateByClicks: false,
            wouldPauseByClicks: true
          },
          
          // Overall status of which mechanism is controlling the campaign
          clickThresholdActive: pauseInfo === null, // Click threshold only works when not paused due to spent value
          controllingFactor: pauseInfo 
            ? 'spent_value_threshold' 
            : (urlData?.wouldPauseByClicks 
              ? 'click_threshold_pause'
              : (urlData?.wouldActivateByClicks 
                ? 'click_threshold_activate' 
                : 'other'))
        };
      }));
      
      // Reset test mode
      process.env.TEST_MODE = 'false';
      
      res.json({
        success: true,
        message: 'Comprehensive test completed for both spent value and click threshold functionality',
        results: results.filter(Boolean)
      });
    } catch (error) {
      console.error('Error in test-spent-value-monitoring:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing auto-management functionality',
        error: String(error)
      });
    }
  });

  /**
   * Test routes for manually verifying specific auto-management scenarios
   * These endpoints allow testing of:
   * 1. Date change behavior
   * 2. Click threshold (15,000/5,000) behavior
   * 3. Spent value ($10) behavior
   * 4. 10-minute recheck after spent value pause
   */
  
  // Test 1: Date Change Testing
  app.post("/api/system/test-date-change", async (_req: Request, res: Response) => {
    try {
      console.log('🧪 TEST 1: Date Change Testing');
      
      // Get a campaign with auto-management enabled
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.autoManageTrafficstar, true));
      
      if (!campaign) {
        return res.status(400).json({
          success: false,
          message: 'No auto-managed campaign found for testing'
        });
      }
      
      console.log(`Found campaign ${campaign.id} for testing`);
      
      // Update lastTrafficstarSync to yesterday to simulate a date change
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await db.update(campaigns)
        .set({
          lastTrafficstarSync: yesterday,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaign.id));
      
      console.log(`Updated campaign ${campaign.id} lastTrafficstarSync to yesterday: ${yesterday.toISOString()}`);
      
      // Trigger auto-management
      console.log('Triggering auto-management to test date change behavior...');
      await trafficStarService.autoManageCampaigns();
      
      res.json({
        success: true,
        message: 'Date change test completed - check logs for results'
      });
    } catch (error) {
      console.error('Error in test-date-change:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing date change functionality',
        error: String(error)
      });
    }
  });
  
  // Test 2: Click Threshold Testing
  app.post("/api/system/test-click-threshold", async (_req: Request, res: Response) => {
    try {
      console.log('🧪 TEST 2: Click Threshold Testing');
      
      // Get a campaign with auto-management enabled
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.autoManageTrafficstar, true));
      
      if (!campaign) {
        return res.status(400).json({
          success: false,
          message: 'No auto-managed campaign found for testing'
        });
      }
      
      console.log(`Found campaign ${campaign.id} for testing`);
      
      // Make sure we test with a fresh state - activate the campaign first
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = campaign.trafficstarCampaignId;
        
        // Make sure campaign is active to start
        await trafficStarService.activateCampaign(Number(trafficstarId));
        console.log(`Activated TrafficStar campaign ${trafficstarId} for testing`);
      }
      
      // Step 1: Make sure spent value pause mechanism is not active
      // This ensures click threshold checks will run
      const currentUtcDate = new Date().toISOString().split('T')[0];
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, currentUtcDate);
        if (pauseInfo) {
          console.log(`Campaign was paused due to spent value - clearing this state for testing`);
          trafficStarService.clearSpentValuePause(trafficstarId);
        }
      }
      
      // Step 2: Test scenario 1 - Less than 5000 clicks remaining
      // Get existing URLs for the campaign
      const existingUrls = await db
        .select()
        .from(urls)
        .where(eq(urls.campaignId, campaign.id));
      
      console.log(`Campaign has ${existingUrls.length} URLs`);
      
      // Setting click limit to exactly 3000 (well below the 5000 threshold)
      if (existingUrls.length === 0) {
        // Create a test URL with less than 5000 clicks
        await db.insert(urls).values({
          campaignId: campaign.id,
          name: 'Test URL 1 - Below Threshold',
          targetUrl: 'https://example.com/test1',
          clickLimit: 3000,
          clicks: 0,
          status: 'active',
          originalClickLimit: 3000,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log('Created test URL with 3000 clicks remaining (well below 5000 threshold)');
      } else {
        // Update existing URLs for testing
        await db.update(urls)
          .set({
            clickLimit: 3000,
            clicks: 0,
            status: 'active',
            updatedAt: new Date()
          })
          .where(eq(urls.campaignId, campaign.id));
          
        console.log('Updated existing URLs to have 3000 clicks remaining (well below 5000 threshold)');
      }
      
      // Trigger auto-management to see the pause due to low clicks
      console.log('✅ TEST CASE: Campaign with less than 5000 clicks should PAUSE');
      console.log('Triggering auto-management to test pause due to low clicks (<5000)...');
      await trafficStarService.autoManageCampaigns();
      
      // Wait a moment to let the API call complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check campaign status after pause attempt
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const campaignStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
        console.log(`Campaign status after low clicks test: ${JSON.stringify(campaignStatus)}`);
      }
      
      // Step 3: Test scenario 2 - More than 15000 clicks remaining
      await db.update(urls)
        .set({
          clickLimit: 20000,
          clicks: 0,
          status: 'active',
          updatedAt: new Date()
        })
        .where(eq(urls.campaignId, campaign.id));
        
      console.log('Updated URLs to have 20000 clicks remaining (well above 15000 threshold)');
      
      // Trigger auto-management to see the activation due to high clicks
      console.log('✅ TEST CASE: Campaign with more than 15000 clicks should ACTIVATE');
      console.log('Triggering auto-management to test activation due to high clicks (>15000)...');
      await trafficStarService.autoManageCampaigns();
      
      // Wait a moment to let the API call complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check campaign status after activation attempt
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const campaignStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
        console.log(`Campaign status after high clicks test: ${JSON.stringify(campaignStatus)}`);
      }
      
      // Step 4: Now test spent value overriding click threshold
      console.log('✅ TEST CASE: Spent value over $10 should OVERRIDE click threshold mechanism');
      
      // Enable test mode to simulate high spent values
      process.env.TEST_MODE = 'true';
      
      // Make sure campaign is active
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        await trafficStarService.activateCampaign(Number(trafficstarId));
      }
      
      // Run spent value check (in test mode, should report >$10 and pause)
      console.log('Running spent value check with clicks still >15000...');
      await trafficStarService.checkCampaignsSpentValue();
      
      // Wait a moment to let the API call complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Even though clicks are high, campaign should be paused due to spent value
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const campaignStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
        console.log(`Campaign status after spent value override test: ${JSON.stringify(campaignStatus)}`);
        
        const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, currentUtcDate);
        if (pauseInfo) {
          console.log(`Spent value mechanism properly overrode click threshold mechanism`);
          console.log(`Campaign paused with spent value > $10 even though clicks > 15000`);
          console.log(`Recheck scheduled for: ${pauseInfo.recheckAt.toISOString()}`);
          console.log(`Minutes until recheck: ${Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000))}`);
        } else {
          console.log(`ERROR: Campaign was NOT paused due to high spent value despite clicks > 15000`);
        }
      }
      
      // Step 5: Verify that the spent value mechanism disables click threshold
      console.log('✅ TEST CASE: Click threshold should be DISABLED until next UTC date change');
      console.log('Trying to reactivate campaign by updating clicks...');
      
      // Trigger auto-management to verify click threshold is disabled
      // Even with lots of clicks, campaign should remain paused
      console.log('Triggering auto-management with spent value pause active...');
      await trafficStarService.autoManageCampaigns();
      
      // Wait a moment to let the API call complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Campaign should still be paused despite high clicks
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const campaignStatus = await trafficStarService.getCachedCampaignStatus(trafficstarId);
        console.log(`Final campaign status: ${JSON.stringify(campaignStatus)}`);
        console.log(`Campaign should still be paused despite high clicks (${campaignStatus?.active === false ? 'CORRECT' : 'WRONG'})`);
      }
      
      // Step 6: Test that mechanism resets after UTC date change
      console.log('✅ TEST CASE: Click threshold should REACTIVATE after UTC date change');
      
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        // Simulate a date change
        const newUtcDate = new Date();
        newUtcDate.setDate(newUtcDate.getDate() + 1);
        const newUtcDateStr = newUtcDate.toISOString().split('T')[0];
        
        console.log(`Current UTC date: ${currentUtcDate}, Simulating next UTC date: ${newUtcDateStr}`);
        
        // Check if pause info is cleared with new date
        const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, newUtcDateStr);
        console.log(`Pause info for new UTC date: ${pauseInfo ? 'Still active (WRONG)' : 'Cleared (CORRECT)'}`);
      }
      
      // Clean up
      process.env.TEST_MODE = 'false';
      
      res.json({
        success: true,
        message: 'Click threshold test completed - check logs for all test results'
      });
    } catch (error) {
      console.error('Error in test-click-threshold:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing click threshold functionality',
        error: String(error)
      });
    }
  });
  
  // Test 3: Spent Value Testing
  app.post("/api/system/test-spent-value", async (_req: Request, res: Response) => {
    try {
      console.log('🧪 TEST 3: Spent Value Testing');
      
      // Enable test mode to get simulated spent value
      process.env.TEST_MODE = 'true';
      
      // Get a campaign with auto-management enabled
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.autoManageTrafficstar, true));
      
      if (!campaign) {
        return res.status(400).json({
          success: false,
          message: 'No auto-managed campaign found for testing'
        });
      }
      
      console.log(`Found campaign ${campaign.id} for testing`);
      
      // Make the campaign active in TrafficStar
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = campaign.trafficstarCampaignId;
        
        await db.update(trafficstarCampaigns)
          .set({
            active: true,
            status: 'enabled',
            updatedAt: new Date()
          })
          .where(eq(trafficstarCampaigns.trafficstarId, trafficstarId));
        
        console.log(`Set TrafficStar campaign ${trafficstarId} as active for testing`);
      }
      
      // Run spent value check (in test mode, should report >$10 and pause)
      console.log('Running spent value check to test pause due to high spent value...');
      await trafficStarService.checkCampaignsSpentValue();
      
      // Check if campaign was paused
      if (campaign.trafficstarCampaignId) {
        const trafficstarId = Number(campaign.trafficstarCampaignId);
        const currentUtcDate = new Date().toISOString().split('T')[0];
        const pauseInfo = trafficStarService.getSpentValuePauseInfo(trafficstarId, currentUtcDate);
        
        if (pauseInfo) {
          console.log(`Campaign was paused due to high spent value`);
          console.log(`Recheck scheduled for: ${pauseInfo.recheckAt.toISOString()}`);
          console.log(`Minutes until recheck: ${Math.ceil((pauseInfo.recheckAt.getTime() - Date.now()) / (60 * 1000))}`);
        } else {
          console.log(`Campaign was NOT paused due to high spent value - test failed`);
        }
      }
      
      // Check that click threshold is disabled after spent value pause
      console.log('Triggering auto-management to verify click threshold is disabled...');
      await trafficStarService.autoManageCampaigns();
      
      // Clean up
      process.env.TEST_MODE = 'false';
      
      res.json({
        success: true,
        message: 'Spent value test completed - check logs for results'
      });
    } catch (error) {
      console.error('Error in test-spent-value:', error);
      res.status(500).json({
        success: false,
        message: 'Error testing spent value functionality',
        error: String(error)
      });
    }
  });
  
  /**
   * Test route for verifying the URL budget handling functionality
   * This route allows testing the URL budget tracking and update functionality
   */
  app.post("/api/system/test-url-budget-update", async (req: Request, res: Response) => {
    try {
      const { campaignId, urlId, clickValue } = req.body;
      
      if (!campaignId || !urlId) {
        return res.status(400).json({ 
          success: false,
          message: "Missing required parameters: campaignId and urlId"
        });
      }
      
      // Get the campaign to check if it's linked to TrafficStar
      const campaign = await storage.getCampaign(parseInt(campaignId));
      if (!campaign) {
        return res.status(404).json({ 
          success: false,
          message: "Campaign not found"
        });
      }
      
      if (!campaign.trafficstarCampaignId) {
        return res.status(400).json({ 
          success: false,
          message: "Campaign is not linked to TrafficStar"
        });
      }
      
      // Get the URL to use its click limit
      const url = await storage.getUrl(parseInt(urlId));
      if (!url) {
        return res.status(404).json({ 
          success: false,
          message: "URL not found"
        });
      }
      
      console.log(`🧪 TEST: Tracking URL ${urlId} for budget update in campaign ${campaignId}`);
      
      // Track the URL for budget update
      const clicksToTrack = clickValue ? parseInt(clickValue) : url.clickLimit;
      await trafficStarService.trackNewUrlForBudgetUpdate(
        url.id,
        parseInt(campaignId),
        campaign.trafficstarCampaignId,
        clicksToTrack,
        campaign.pricePerThousand || 1000
      );
      
      // If immediate parameter is provided, instantly process the pending URL budgets
      if (req.body.immediate === true) {
        console.log(`🧪 TEST: Immediately processing pending URL budgets`);
        await trafficStarService.processPendingUrlBudgets();
      }
      
      res.json({
        success: true,
        message: `URL ${urlId} tracked for budget update in campaign ${campaignId}`,
        clicksTracked: clicksToTrack,
        processingTime: req.body.immediate ? 'Immediate' : '10 minutes'
      });
    } catch (error) {
      console.error('Error testing URL budget update:', error);
      res.status(500).json({ 
        success: false,
        message: "Error testing URL budget update functionality",
        error: String(error)
      });
    }
  });

  // Create an HTTP/2 capable server
  // We're using a regular HTTP server instead of SPDY for now due to compatibility issues
  // We'll handle the HTTP/2.0 headers in the individual route handlers
  return server;
}
