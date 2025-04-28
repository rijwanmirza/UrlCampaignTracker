#!/bin/bash

# VPS Update Script for Click Protection Features
# This script updates your VPS with:
# 1. Click protection database triggers to prevent automatic click quantity changes
# 2. Original URL Records table for master URL data management
# 3. Unlimited click quantity validation (removed frontend/backend limits)

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Header
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       URL CAMPAIGN MANAGER - CLICK PROTECTION UPDATE         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Check if script is run as root
if [ "$(id -u)" != "0" ]; then
   echo -e "${RED}⛔ This script must be run as root${NC}" 
   exit 1
fi

echo -e "${YELLOW}📋 PRE-DEPLOYMENT CHECKLIST:${NC}"
echo -e "${YELLOW}1. Make sure PostgreSQL is running${NC}"
echo -e "${YELLOW}2. Ensure your application is deployed at /var/www/url-campaign or modify the paths below${NC}"
echo -e "${YELLOW}3. Have your database credentials ready${NC}"
echo

# Configuration - MODIFY THESE VALUES
APP_DIR="/var/www/url-campaign"
DB_USER="postgres"
DB_NAME="postgres"
PM2_APP_NAME="url-campaign"

# Confirm values
echo -e "${YELLOW}Current configuration:${NC}"
echo -e "🔹 Application directory: ${APP_DIR}"
echo -e "🔹 Database user: ${DB_USER}"
echo -e "🔹 Database name: ${DB_NAME}"
echo -e "🔹 PM2 app name: ${PM2_APP_NAME}"
echo

# Ask for confirmation
read -p "Is this configuration correct? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
  echo -e "${RED}Please edit the script with the correct values and run again.${NC}"
  exit 1
fi

echo -e "${GREEN}Starting deployment...${NC}"
echo

# Step 2: Backup existing application
echo -e "${YELLOW}📦 Backing up current application...${NC}"
BACKUP_DIR="/root/url-campaign-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r $APP_DIR/* $BACKUP_DIR/
echo -e "${GREEN}✓ Backup created at ${BACKUP_DIR}${NC}"
echo

# Step 3: Backup the database
echo -e "${YELLOW}🗃️ Backing up database...${NC}"
BACKUP_SQL="/root/url-campaign-db-$(date +%Y%m%d%H%M%S).sql"
sudo -u $DB_USER pg_dump $DB_NAME > $BACKUP_SQL
echo -e "${GREEN}✓ Database backup created at ${BACKUP_SQL}${NC}"
echo

# Step 4: Stop the application
echo -e "${YELLOW}🛑 Stopping application...${NC}"
pm2 stop $PM2_APP_NAME
echo -e "${GREEN}✓ Application stopped${NC}"
echo

# Step 5: Create the database migration file
echo -e "${YELLOW}📝 Creating database migration file...${NC}"
MIGRATION_FILE="$APP_DIR/click-protection-migration.sql"

cat > $MIGRATION_FILE << 'EOF'
-- Click Protection Migration

-- Step 1: Check if original_url_records table exists, if not create it
CREATE TABLE IF NOT EXISTS original_url_records (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    click_limit INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Step 2: Create an index for faster lookups
CREATE INDEX IF NOT EXISTS original_url_records_name_idx ON original_url_records(name);

-- Step 3: Create functions to protect clicks from being updated automatically
CREATE OR REPLACE FUNCTION protect_url_clicks()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is not a direct update from the original URL records sync mechanism
    -- Note: The sync uses a direct ALTER TABLE to temporarily disable triggers
    IF (TG_OP = 'UPDATE' AND NEW.clicks != OLD.clicks) THEN
        RAISE EXCEPTION 'Direct click value updates are not allowed. Use the Original URL Records section to update click values.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create or replace trigger
DROP TRIGGER IF EXISTS url_clicks_protection_trigger ON urls;
CREATE TRIGGER url_clicks_protection_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION protect_url_clicks();

-- Step 5: Disable click limit validation max values
-- This is handled in the code by removing MAX_REASONABLE_CLICKS validation

-- Insert comment to log migration
INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('click_protection_migration', 'Applied on ' || NOW(), NOW(), NOW())
ON CONFLICT (key) DO UPDATE
    SET value = 'Applied on ' || NOW(),
        updated_at = NOW();
EOF

echo -e "${GREEN}✓ Database migration file created at ${MIGRATION_FILE}${NC}"
echo

# Step 6: Apply database migration
echo -e "${YELLOW}🔄 Applying database migration...${NC}"
sudo -u $DB_USER psql $DB_NAME < $MIGRATION_FILE
echo -e "${GREEN}✓ Database migration applied${NC}"
echo

# Step 7: Update server-side code for click protection
echo -e "${YELLOW}📄 Updating server-side click protection code...${NC}"

# Create file to fix click protecton and validator
VALIDATOR_FIX="$APP_DIR/fix-click-limit-validation.js"

cat > $VALIDATOR_FIX << 'EOF'
/**
 * Fix TrafficStar Validator to remove click limit validation
 * This script patches the trafficstar-validator.js file to remove MAX_REASONABLE_CLICKS
 * validation that was previously limiting click quantities
 */

const fs = require('fs');
const path = require('path');

// Path to validator file
const validatorPath = path.join(__dirname, 'server', 'utils', 'trafficstar-validator.js');

// Check if file exists
if (!fs.existsSync(validatorPath)) {
  console.error('❌ Validator file not found at:', validatorPath);
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(validatorPath, 'utf8');

// Replace any MAX_REASONABLE_CLICKS constants and validations
const patterns = [
  /const MAX_REASONABLE_CLICKS\s*=\s*\d+;/g,  // Find constant definition
  /if\s*\(\s*value\s*>\s*MAX_REASONABLE_CLICKS\s*\)/g,  // Find validation check
  /if\s*\(\s*clickValue\s*>\s*MAX_REASONABLE_CLICKS\s*\)/g,  // Find another form of check
  /Math\.min\(.*?, MAX_REASONABLE_CLICKS\)/g  // Find any clamping with Math.min
];

let modified = false;
for (const pattern of patterns) {
  if (pattern.test(content)) {
    if (pattern.toString().includes('MAX_REASONABLE_CLICKS')) {
      // For constant definition, replace with very high value
      content = content.replace(/const MAX_REASONABLE_CLICKS\s*=\s*\d+;/g, 'const MAX_REASONABLE_CLICKS = 1000000000; // Increased to 1 billion');
    } else if (pattern.toString().includes('Math.min')) {
      // For Math.min usages, just use the original value without limiting
      content = content.replace(/Math\.min\((.*?), MAX_REASONABLE_CLICKS\)/g, '$1');
    } else {
      // For validation checks, comment them out
      content = content.replace(pattern, '/* Removed click limit validation */ false // $&');
    }
    modified = true;
  }
}

// Check if any changes were made
if (!modified) {
  console.log('ℹ️ No validation limits found to remove. File may already be updated.');
} else {
  // Write the updated content back to the file
  fs.writeFileSync(validatorPath, content, 'utf8');
  console.log('✅ Successfully removed click limit validation!');
}
EOF

# Make the script executable
chmod +x $VALIDATOR_FIX

# Run the validator fix script
echo -e "${YELLOW}🔧 Removing click limit validation...${NC}"
node $VALIDATOR_FIX
echo -e "${GREEN}✓ Validator fix applied${NC}"
echo

# Step 8: Create migration for the storage.js file to add original record sync
echo -e "${YELLOW}📄 Adding original URL record sync functionality...${NC}"

STORAGE_FIX="$APP_DIR/fix-storage-sync.js"

cat > $STORAGE_FIX << 'EOF'
/**
 * Add Original URL Records sync functionality
 * This script adds the synchronization method between original URL records
 * and campaign URLs to the storage.js file
 */

const fs = require('fs');
const path = require('path');

// Path to storage file
const storagePath = path.join(__dirname, 'server', 'storage.js');

// Check if file exists
if (!fs.existsSync(storagePath)) {
  console.error('❌ Storage file not found at:', storagePath);
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(storagePath, 'utf8');

// Check if syncUrlsWithOriginalRecord already exists
if (content.includes('syncUrlsWithOriginalRecord')) {
  console.log('ℹ️ Sync function already exists. No update needed.');
  process.exit(0);
}

// Find the end of the DatabaseStorage class
const classEndIndex = content.lastIndexOf('module.exports');

if (classEndIndex === -1) {
  console.error('❌ Could not find end of storage class');
  process.exit(1);
}

// Add our sync method before the exports
const syncMethod = `
  /**
   * Synchronize URLs with an Original URL Record
   * This is used to update the click values of URLs based on original URL record data
   * It uses an ALTER TABLE approach to bypass the click protection triggers
   */
  async syncUrlsWithOriginalRecord(originalRecordId) {
    try {
      // First, get the original record
      const originalRecord = await this.getOriginalUrlRecord(originalRecordId);
      
      if (!originalRecord) {
        throw new Error(\`Original URL record with ID \${originalRecordId} not found\`);
      }
      
      // Find all URLs that need to be updated based on the original record name
      const urls = await db.query(
        \`SELECT * FROM urls WHERE name = $1\`,
        [originalRecord.name]
      );
      
      if (urls.rows.length === 0) {
        console.log(\`No URLs found matching original record name '\${originalRecord.name}'\`);
        return { success: true, message: 'No matching URLs found', updatedCount: 0 };
      }
      
      console.log(\`Found \${urls.rows.length} URLs to update from original record\`);
      
      // We use a direct SQL approach with ALTER TABLE to temporarily disable
      // the triggers that prevent click updates
      
      // First, disable the trigger
      await db.query('ALTER TABLE urls DISABLE TRIGGER url_clicks_protection_trigger');
      
      // Update each URL's click values using the original record
      let updatedCount = 0;
      let errors = [];
      
      for (const url of urls.rows) {
        try {
          // Calculate the new click limit for the URL
          // If the URL belongs to a campaign, we apply the campaign multiplier
          let multiplier = 1.0;
          
          if (url.campaign_id) {
            const campaignResult = await db.query(
              'SELECT multiplier FROM campaigns WHERE id = $1',
              [url.campaign_id]
            );
            
            if (campaignResult.rows.length > 0 && campaignResult.rows[0].multiplier) {
              multiplier = parseFloat(campaignResult.rows[0].multiplier) || 1.0;
            }
          }
          
          const newClickLimit = Math.round(originalRecord.click_limit * multiplier);
          
          // Update the URL's click limit and click count
          await db.query(
            \`UPDATE urls 
             SET clicks = $1, 
                 click_limit = $2,
                 original_click_limit = $3,
                 updated_at = NOW()
             WHERE id = $4\`,
            [originalRecord.clicks, newClickLimit, originalRecord.click_limit, url.id]
          );
          
          updatedCount++;
          console.log(\`Updated URL ID \${url.id} with click limit \${newClickLimit} and clicks \${originalRecord.clicks}\`);
        } catch (urlError) {
          errors.push(\`Error updating URL ID \${url.id}: \${urlError.message}\`);
          console.error(\`Error updating URL ID \${url.id}:\`, urlError);
        }
      }
      
      // Re-enable the trigger
      await db.query('ALTER TABLE urls ENABLE TRIGGER url_clicks_protection_trigger');
      
      return { 
        success: true, 
        message: \`Updated \${updatedCount} URLs from original record\`, 
        updatedCount,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('Error in syncUrlsWithOriginalRecord:', error);
      
      // In case of error, try to re-enable the trigger
      try {
        await db.query('ALTER TABLE urls ENABLE TRIGGER url_clicks_protection_trigger');
      } catch (triggerError) {
        console.error('Failed to re-enable trigger:', triggerError);
      }
      
      throw error;
    }
  }
  
  /**
   * Get a single original URL record by ID
   */
  async getOriginalUrlRecord(id) {
    const result = await db.query(
      'SELECT * FROM original_url_records WHERE id = $1',
      [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
  
  /**
   * Get all original URL records
   */
  async getOriginalUrlRecords(options = {}) {
    const { limit = 100, offset = 0, status = null } = options;
    
    let query = 'SELECT * FROM original_url_records';
    const params = [];
    
    if (status !== null) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as count FROM original_url_records';
    if (status !== null) {
      countQuery += ' WHERE status = $1';
    }
    
    const countResult = await db.query(countQuery, status !== null ? [status] : []);
    const totalCount = parseInt(countResult.rows[0].count, 10);
    
    return {
      records: result.rows,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + result.rows.length < totalCount
      }
    };
  }
  
  /**
   * Create a new original URL record
   */
  async createOriginalUrlRecord(data) {
    const result = await db.query(
      \`INSERT INTO original_url_records (
        name, target_url, click_limit, clicks, status, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *\`,
      [
        data.name,
        data.target_url,
        data.click_limit || 0,
        data.clicks || 0,
        data.status || 'active',
        data.notes || null
      ]
    );
    
    return result.rows[0];
  }
  
  /**
   * Update an original URL record
   */
  async updateOriginalUrlRecord(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;
    
    // Build dynamic update query based on provided fields
    for (const [key, value] of Object.entries(data)) {
      if (['name', 'target_url', 'click_limit', 'clicks', 'status', 'notes'].includes(key)) {
        fields.push(\`\${key} = $\${paramIndex++}\`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      throw new Error('No valid fields provided for update');
    }
    
    fields.push(\`updated_at = NOW()\`);
    
    values.push(id);
    
    const result = await db.query(
      \`UPDATE original_url_records SET \${fields.join(', ')} WHERE id = $\${paramIndex} RETURNING *\`,
      values
    );
    
    return result.rows[0];
  }
  
  /**
   * Delete an original URL record
   */
  async deleteOriginalUrlRecord(id) {
    const result = await db.query(
      'DELETE FROM original_url_records WHERE id = $1 RETURNING *',
      [id]
    );
    
    return result.rows.length > 0;
  }

`;

// Insert the sync method before the exports
const updatedContent = content.slice(0, classEndIndex) + syncMethod + content.slice(classEndIndex);

// Write the updated content back to the file
fs.writeFileSync(storagePath, updatedContent, 'utf8');
console.log('✅ Successfully added original URL record sync functionality!');
EOF

# Make the script executable
chmod +x $STORAGE_FIX

# Run the storage fix script
echo -e "${YELLOW}🔧 Adding original URL record sync functionality...${NC}"
node $STORAGE_FIX
echo -e "${GREEN}✓ Storage fix applied${NC}"
echo

# Step 9: Create routes fix for original URL records
echo -e "${YELLOW}📄 Adding Original URL Records routes...${NC}"

ROUTES_FIX="$APP_DIR/fix-routes-original-records.js"

cat > $ROUTES_FIX << 'EOF'
/**
 * Add Original URL Records routes
 * This script adds the API routes for original URL records management
 * to the routes.js file
 */

const fs = require('fs');
const path = require('path');

// Path to routes file
const routesPath = path.join(__dirname, 'server', 'routes.js');

// Check if file exists
if (!fs.existsSync(routesPath)) {
  console.error('❌ Routes file not found at:', routesPath);
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(routesPath, 'utf8');

// Check if original URL record routes already exist
if (content.includes('/api/original-url-records')) {
  console.log('ℹ️ Original URL record routes already exist. No update needed.');
  process.exit(0);
}

// Find a good insertion point, look for other routes
const insertionPoint = content.indexOf('app.get(\'/api/trafficstar');

if (insertionPoint === -1) {
  console.error('❌ Could not find insertion point in routes file');
  process.exit(1);
}

// Add our routes
const newRoutes = `
  // ===== Original URL Records API =====
  
  // Get all original URL records
  app.get('/api/original-url-records', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const status = req.query.status || null;
      
      const result = await storage.getOriginalUrlRecords({ limit, offset, status });
      res.json(result);
    } catch (error) {
      console.error('Error getting original URL records:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get a single original URL record by ID
  app.get('/api/original-url-records/:id', async (req, res) => {
    try {
      const record = await storage.getOriginalUrlRecord(parseInt(req.params.id, 10));
      
      if (!record) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      res.json(record);
    } catch (error) {
      console.error('Error getting original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Create a new original URL record
  app.post('/api/original-url-records', async (req, res) => {
    try {
      // Validate required fields
      if (!req.body.name || !req.body.target_url) {
        return res.status(400).json({ error: 'Name and target URL are required' });
      }
      
      // Create the record
      const record = await storage.createOriginalUrlRecord(req.body);
      res.status(201).json(record);
    } catch (error) {
      console.error('Error creating original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Update an original URL record
  app.patch('/api/original-url-records/:id', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await storage.getOriginalUrlRecord(recordId);
      if (!existingRecord) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      // Update the record
      const updatedRecord = await storage.updateOriginalUrlRecord(recordId, req.body);
      res.json(updatedRecord);
    } catch (error) {
      console.error('Error updating original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete an original URL record
  app.delete('/api/original-url-records/:id', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await storage.getOriginalUrlRecord(recordId);
      if (!existingRecord) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      // Delete the record
      const success = await storage.deleteOriginalUrlRecord(recordId);
      
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: 'Failed to delete original URL record' });
      }
    } catch (error) {
      console.error('Error deleting original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Sync URLs with original URL record
  app.post('/api/original-url-records/:id/sync', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await storage.getOriginalUrlRecord(recordId);
      if (!existingRecord) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      // Perform the sync
      const result = await storage.syncUrlsWithOriginalRecord(recordId);
      res.json(result);
    } catch (error) {
      console.error('Error syncing URLs with original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });

`;

// Insert the routes
const updatedContent = content.slice(0, insertionPoint) + newRoutes + content.slice(insertionPoint);

// Write the updated content back to the file
fs.writeFileSync(routesPath, updatedContent, 'utf8');
console.log('✅ Successfully added original URL records routes!');
EOF

# Make the script executable
chmod +x $ROUTES_FIX

# Run the routes fix script
echo -e "${YELLOW}🔧 Adding Original URL Records routes...${NC}"
node $ROUTES_FIX
echo -e "${GREEN}✓ Routes fix applied${NC}"
echo

# Step 10: Create the database original URLs table if doesn't exist
echo -e "${YELLOW}📊 Creating original URL records table...${NC}"
CREATE_TABLE_SQL="$APP_DIR/create-original-urls-table.sql"

cat > $CREATE_TABLE_SQL << 'EOF'
-- Check if original_url_records table exists
CREATE TABLE IF NOT EXISTS original_url_records (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    target_url TEXT NOT NULL,
    click_limit INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS original_url_records_name_idx ON original_url_records(name);
EOF

sudo -u $DB_USER psql $DB_NAME < $CREATE_TABLE_SQL
echo -e "${GREEN}✓ Original URL records table created/updated${NC}"
echo

# Step 11: Apply click protection trigger
echo -e "${YELLOW}🛡️ Applying click protection trigger...${NC}"
PROTECTION_TRIGGER_SQL="$APP_DIR/create-click-protection-trigger.sql"

cat > $PROTECTION_TRIGGER_SQL << 'EOF'
-- Create function to protect clicks from being updated automatically
CREATE OR REPLACE FUNCTION protect_url_clicks()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is not a direct update from the original URL records sync mechanism
    -- Note: The sync uses a direct ALTER TABLE to temporarily disable triggers
    IF (TG_OP = 'UPDATE' AND NEW.clicks != OLD.clicks) THEN
        RAISE EXCEPTION 'Direct click value updates are not allowed. Use the Original URL Records section to update click values.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS url_clicks_protection_trigger ON urls;
CREATE TRIGGER url_clicks_protection_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION protect_url_clicks();

-- Insert comment to log migration
INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('click_protection_trigger', 'Applied on ' || NOW(), NOW(), NOW())
ON CONFLICT (key) DO UPDATE
    SET value = 'Applied on ' || NOW(),
        updated_at = NOW();
EOF

sudo -u $DB_USER psql $DB_NAME < $PROTECTION_TRIGGER_SQL
echo -e "${GREEN}✓ Click protection trigger applied${NC}"
echo

# Step 12: Start the application
echo -e "${YELLOW}🚀 Starting application...${NC}"
cd $APP_DIR
pm2 start $PM2_APP_NAME
echo -e "${GREEN}✓ Application started${NC}"
echo

# Step 13: Save PM2 startup configuration
echo -e "${YELLOW}💾 Saving PM2 startup configuration...${NC}"
pm2 save
echo -e "${GREEN}✓ PM2 configuration saved${NC}"
echo

# Final success message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                DEPLOYMENT COMPLETED SUCCESSFULLY             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}The URL Campaign Manager has been updated with:${NC}"
echo -e "${GREEN}✓ Click protection to prevent automatic click quantity changes${NC}"
echo -e "${GREEN}✓ Original URL Records feature for master URL data management${NC}"
echo -e "${GREEN}✓ Unlimited click quantity validation (limits removed)${NC}"
echo
echo -e "${YELLOW}To verify the changes:${NC}"
echo -e "1. Visit your application URL"
echo -e "2. Navigate to the 'Original URL Records' section"
echo -e "3. Create a record with a high click limit"
echo -e "4. Use the sync function to update campaign URLs"
echo
echo -e "${YELLOW}If you encounter any issues:${NC}"
echo -e "1. Check PM2 logs: ${BLUE}pm2 logs ${PM2_APP_NAME}${NC}"
echo -e "2. Restore backup if needed: ${BLUE}cp -r ${BACKUP_DIR}/* ${APP_DIR}/${NC}"
echo -e "3. Restore database: ${BLUE}sudo -u ${DB_USER} psql ${DB_NAME} < ${BACKUP_SQL}${NC}"
echo
echo -e "${GREEN}Backup files:${NC}"
echo -e "- Application: ${BACKUP_DIR}"
echo -e "- Database: ${BACKUP_SQL}"
echo