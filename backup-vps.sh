#!/bin/bash
# Script to backup the URL Management System from your VPS

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
  show_error "Usage: ./backup-vps.sh <VPS_IP> [SSH_PORT] [SSH_USER] [BACKUP_DIR]"
  exit 1
fi

VPS_IP=$1
SSH_PORT=${2:-22}
SSH_USER=${3:-root}
BACKUP_DIR=${4:-"./backups"}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp for the backup
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILENAME="url-management-backup-$TIMESTAMP.tar.gz"

show_progress "Starting backup from VPS: $VPS_IP"

# Create a remote script to perform the backup on the VPS
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "cat > /tmp/perform-backup.sh << 'EOF'
#!/bin/bash
# Script to create a backup of the URL Management System

# Create temporary directory for the backup
TEMP_DIR=\$(mktemp -d)
BACKUP_FILE=\"/tmp/url-management-backup.tar.gz\"

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

echo \"Backup completed: \$BACKUP_FILE\"
EOF"

# Make the remote script executable
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "chmod +x /tmp/perform-backup.sh"

# Execute the backup script on the VPS
show_progress "Performing backup on VPS..."
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "/tmp/perform-backup.sh"

# Download the backup
show_progress "Downloading backup from VPS..."
scp -P $SSH_PORT $SSH_USER@$VPS_IP:/tmp/url-management-backup.tar.gz "$BACKUP_DIR/$BACKUP_FILENAME"

# Clean up remote temporary files
ssh -p $SSH_PORT $SSH_USER@$VPS_IP "rm /tmp/perform-backup.sh /tmp/url-management-backup.tar.gz"

show_progress "Backup completed successfully!"
show_progress "Backup file saved to: $BACKUP_DIR/$BACKUP_FILENAME"