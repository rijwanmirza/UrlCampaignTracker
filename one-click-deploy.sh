#!/bin/bash
# One-click deployment script for URL Management System

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

# Function to show warnings
show_warning() {
  echo -e "${YELLOW}[!] $1${NC}"
}

# Check if required variables are provided
if [ -z "$1" ]; then
  show_error "Usage: ./one-click-deploy.sh <VPS_IP> [SSH_PORT] [SSH_USER] [BACKUP_FREQUENCY]"
  exit 1
fi

VPS_IP=$1
SSH_PORT=${2:-22}
SSH_USER=${3:-root}
BACKUP_FREQUENCY=${4:-"daily"} # Options: hourly, daily, weekly, monthly

show_progress "Starting one-click deployment to VPS: $VPS_IP"

# Step 1: Deploy the application
show_progress "Step 1/3: Deploying application to VPS..."
./deploy-to-vps.sh $VPS_IP $SSH_PORT $SSH_USER

# Check if deployment was successful
if [ $? -ne 0 ]; then
  show_error "Deployment failed. Please check the errors above and try again."
fi

# Step 2: Set up automated backups
show_progress "Step 2/3: Setting up automated backups..."
./setup-automated-backups.sh $VPS_IP $SSH_PORT $SSH_USER $BACKUP_FREQUENCY

# Step 3: Perform an initial backup
show_progress "Step 3/3: Performing initial backup..."
./backup-vps.sh $VPS_IP $SSH_PORT $SSH_USER "./backups"

show_progress "One-click deployment completed successfully!"
show_progress "Your application is now running on http://$VPS_IP"
show_progress "Automated $BACKUP_FREQUENCY backups have been configured"
show_progress "An initial backup has been created in the ./backups directory"
show_progress ""
show_progress "For more information on managing your deployment, please refer to VPS-DEPLOYMENT.md"