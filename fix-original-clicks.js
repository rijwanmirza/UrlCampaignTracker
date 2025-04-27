import { Pool } from 'pg';

async function fixOriginalClicks() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Create a function that just updates the clicks without using any special session variables
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
            'original_click_limit', new_original_click_limit,
            'click_limit', new_click_limit,
            'multiplier', multiplier
          )
        );
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Successfully created function to update original click values');
    
    // Create a new API endpoint to use this function directly
    console.log('✅ Original click update function created. Add the following to server/routes.ts:');
    console.log(`
  // New API route to update original click value using the database function
  app.patch("/api/original-clicks/:id/direct", async (req: Request, res: Response) => {
    const id = req.params.id;
    const { original_click_limit } = req.body;
    
    try {
      // Validate the input
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ message: "Invalid URL ID" });
      }
      
      if (original_click_limit === undefined || isNaN(parseInt(original_click_limit))) {
        return res.status(400).json({ message: "Invalid original click limit value" });
      }
      
      console.log(\`Using direct function to update original click value for URL \${id}\`);
      console.log(\`New original click value: \${original_click_limit}\`);
      
      // Call the database function to update the click value
      const result = await db.execute(\`
        SELECT update_original_click_value($1, $2) as result
      \`, [parseInt(id), parseInt(original_click_limit)]);
      
      if (!result || !result.rows || result.rows.length === 0) {
        return res.status(500).json({ message: "Failed to update original click value" });
      }
      
      const updateResult = result.rows[0].result;
      
      if (!updateResult.success) {
        return res.status(404).json({ message: updateResult.message });
      }
      
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
  });`);
    
  } catch (error) {
    console.error('❌ Error creating function:', error);
  } finally {
    await pool.end();
  }
}

fixOriginalClicks().catch(console.error);
