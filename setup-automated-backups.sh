#!/bin/bash
# Script to set up automated backups on the VPS

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to show progress
show_progress() {
  echo -e "${GREEN}[+] $1${NC}"
}

# Function to show errors
show_error() {
  echo -e "${RED}[!] $1${NC}"
  exit 1
}

# Check if required variables are provided
if [ -z "$1" ]; then
  show_error "Usage: ./setup-automated-backups.sh <VPS_IP> [SSH_PORT] [SSH_USER] [BACKUP_FREQUENCY]"
  exit 1
fi

VPS_IP=$1
SSH_PORT=${2:-22}
SSH_USER=${3:-root}
BACKUP_FREQUENCY=${4:-"daily"} # Options: hourly, daily, weekly, monthly

show_progress "Setting up automated backups on VPS: $VPS_IP"

# Create a backup script on the VPS
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "cat > /opt/backup-url-system.sh << 'EOF'
#!/bin/bash
# Automated backup script for URL Management System

# Create a timestamp
TIMESTAMP=\$(date +\"%Y%m%d-%H%M%S\")
BACKUP_DIR=\"/opt/backups\"
BACKUP_FILE=\"\$BACKUP_DIR/url-management-backup-\$TIMESTAMP.tar.gz\"
RETENTION_DAYS=7

# Create backup directory if it doesn't exist
mkdir -p \"\$BACKUP_DIR\"

# Create temporary directory for the backup
TEMP_DIR=\$(mktemp -d)

# Backup database
echo \"Backing up PostgreSQL database...\"
pg_dump -U urlapp urlapp > \$TEMP_DIR/database_dump.sql

# Backup application files
echo \"Backing up application files...\"
cp -r /opt/url-management-system/app/gmail_config.json \$TEMP_DIR/
cp -r /opt/url-management-system/app/gmail_credentials.json \$TEMP_DIR/
cp -r /opt/url-management-system/app/gmail_token.json \$TEMP_DIR/
cp -r /opt/url-management-system/app/processed_emails.log \$TEMP_DIR/

# Create archive
echo \"Creating archive...\"
tar -czf \$BACKUP_FILE -C \$TEMP_DIR .

# Cleanup
rm -rf \$TEMP_DIR

# Delete backups older than RETENTION_DAYS
find \$BACKUP_DIR -name \"url-management-backup-*.tar.gz\" -type f -mtime +\$RETENTION_DAYS -delete

echo \"Backup completed: \$BACKUP_FILE\"
EOF"

# Make the backup script executable
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "chmod +x /opt/backup-url-system.sh"

# Create appropriate cron job based on frequency
case "$BACKUP_FREQUENCY" in
  "hourly")
    CRON_SCHEDULE="0 * * * *"
    ;;
  "daily")
    CRON_SCHEDULE="0 2 * * *"  # 2 AM every day
    ;;
  "weekly")
    CRON_SCHEDULE="0 2 * * 0"  # 2 AM every Sunday
    ;;
  "monthly")
    CRON_SCHEDULE="0 2 1 * *"  # 2 AM on the 1st of every month
    ;;
  *)
    show_error "Invalid backup frequency. Choose from: hourly, daily, weekly, monthly"
    ;;
esac

# Set up the cron job
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "
  (crontab -l 2>/dev/null || echo '') | grep -v '/opt/backup-url-system.sh' | 
  (cat; echo '$CRON_SCHEDULE /opt/backup-url-system.sh > /var/log/url-backup.log 2>&1') | 
  crontab -
"

show_progress "Automated $BACKUP_FREQUENCY backups have been set up successfully on your VPS"
show_progress "Backups will be stored in /opt/backups and retained for 7 days"