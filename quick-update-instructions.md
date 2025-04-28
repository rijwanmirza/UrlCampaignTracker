# VPS Deployment Instructions

I've created a comprehensive update script that will deploy all our implemented features to your VPS, including:

1. Click protection via database triggers to prevent automatic click quantity changes
2. Original URL Records table for master URL data management 
3. Unlimited click quantity validation (removed frontend/backend limits)
4. Sync mechanism between original URL records and campaign URLs

## How to Deploy

1. **Transfer the script to your VPS**

   Download `vps-update-click-protection.sh` from Replit, then upload it to your VPS using SCP or SFTP.

   ```bash
   # Example SCP command (run from your local machine)
   scp vps-update-click-protection.sh root@your-vps-ip:/root/
   ```

2. **Make the script executable**

   ```bash
   chmod +x /root/vps-update-click-protection.sh
   ```

3. **Review and edit script configuration if needed**

   The script has defaults that you might need to adjust:
   
   ```bash
   # Configuration - MODIFY THESE VALUES
   APP_DIR="/var/www/url-campaign"
   DB_USER="postgres"
   DB_NAME="postgres"
   PM2_APP_NAME="url-campaign"
   ```

4. **Run the script**

   ```bash
   cd /root
   ./vps-update-click-protection.sh
   ```

   The script will:
   - Backup your current application and database
   - Apply database migrations for the original URL records table
   - Apply the click protection trigger
   - Update code to remove click validation limits
   - Add original URL record sync functionality
   - Add API routes for original URL records
   - Restart your application

## Verify the Installation

After running the script, you should see a new "Original URL Records" section in your application. To verify everything works:

1. Create a new original URL record with a high click limit (e.g., 1,000,000+)
2. Create a URL in a campaign with the same name
3. Update the original URL record and sync it
4. Verify the campaign URL is updated with the new click values

## Troubleshooting

If you encounter any issues:

1. Check PM2 logs:
   ```bash
   pm2 logs url-campaign
   ```

2. Verify database tables were created:
   ```bash
   sudo -u postgres psql -d postgres -c "SELECT * FROM original_url_records LIMIT 5;"
   ```

3. Verify the click protection trigger:
   ```bash
   sudo -u postgres psql -d postgres -c "SELECT * FROM pg_trigger WHERE tgname = 'url_clicks_protection_trigger';"
   ```

4. If necessary, restore from the backup created by the script (paths will be shown at the end of the script output)

## Important Notes

1. The script creates full backups before making changes, so it's safe to run.
2. URLs with the same name will be synchronized when you update the original record.
3. Campaign multipliers are respected when updating click limits (e.g., with 2x multiplier, 1000 clicks in original = 2000 in campaign URL).
4. Direct updates to clicks are blocked by the database trigger - changes must go through the Original URL Records section.

Let me know if you encounter any issues during the deployment process!