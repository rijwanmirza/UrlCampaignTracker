# Super Simple Migration Steps

Follow these steps to migrate your application from Replit to your VPS:

## Step 1: Download Files from Replit

1. Download the entire project from Replit:
   - Click on the three dots menu (...)
   - Select "Download as ZIP"
   - Save the ZIP file to your computer

## Step 2: Download the Setup Script from Replit

1. Download the setup script:
   - Click on "simple-vps-setup.sh" file
   - Click the download button
   - Save it to your computer

## Step 3: Upload and Run on Your VPS

1. Connect to your VPS using PuTTY or any SSH client
2. Upload the setup script to your VPS
   - You can use WinSCP or FileZilla to upload the file
   - Or copy the script content and create it directly on the VPS with:
     ```
     nano simple-vps-setup.sh
     ```
     (Paste the content, then press Ctrl+X, Y, Enter to save)

3. Make the script executable:
   ```
   chmod +x simple-vps-setup.sh
   ```

4. Run the script:
   ```
   ./simple-vps-setup.sh
   ```

5. Wait for the installation to complete (might take 5-10 minutes)

6. When it's done, you'll see a message with your application URL

## What If You Need Your Data?

If you need to transfer your existing data:

1. On Replit, export your database:
   ```
   pg_dump $DATABASE_URL > database.sql
   ```

2. Download the database.sql file from Replit

3. Upload database.sql to your VPS

4. Import it on your VPS:
   ```
   cat database.sql | sudo -u postgres psql urlapp
   ```

## If Something Goes Wrong

Try this on your VPS:
```
systemctl status url-system
```

To view logs:
```
journalctl -u url-system
```

To restart:
```
systemctl restart url-system
```