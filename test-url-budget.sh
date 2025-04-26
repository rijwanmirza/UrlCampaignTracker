#!/bin/bash

# Test URL Budget Functionality
# This script tests the URL budget handling functionality with 10-minute waiting period

# Usage instructions
function usage() {
  echo "Usage: $0 -c <campaign-id> -u <url-id> [-v <click-value>] [-i]"
  echo "  -c: Campaign ID"
  echo "  -u: URL ID"
  echo "  -v: Click value (optional, if not provided, URL's click limit will be used)"
  echo "  -i: Process immediately (skip 10-minute waiting period)"
  echo ""
  echo "Example: $0 -c 1 -u 1 -v 1000 -i"
  exit 1
}

# Parse command line arguments
campaign_id=""
url_id=""
click_value=""
immediate=false

while getopts "c:u:v:i" opt; do
  case $opt in
    c) campaign_id="$OPTARG" ;;
    u) url_id="$OPTARG" ;;
    v) click_value="$OPTARG" ;;
    i) immediate=true ;;
    *) usage ;;
  esac
done

# Validate required parameters
if [ -z "$campaign_id" ] || [ -z "$url_id" ]; then
  echo "Error: Campaign ID and URL ID are required"
  usage
fi

# Build JSON payload
json_payload="{"
json_payload+='"campaignId":'"$campaign_id"','
json_payload+='"urlId":'"$url_id"

# Add click value if provided
if [ -n "$click_value" ]; then
  json_payload+=',"clickValue":'"$click_value"
fi

# Add immediate flag if provided
if [ "$immediate" = true ]; then
  json_payload+=',"immediate":true'
fi

json_payload+="}"

# Print test parameters
echo "Running URL Budget Test with the following parameters:"
echo "Campaign ID: $campaign_id"
echo "URL ID: $url_id"
if [ -n "$click_value" ]; then
  echo "Click Value: $click_value"
else
  echo "Click Value: Using URL's click limit"
fi
if [ "$immediate" = true ]; then
  echo "Processing: Immediate"
else
  echo "Processing: After 10-minute wait"
fi

# Execute the test
echo ""
echo "Executing test..."
curl -X POST \
  -H "Content-Type: application/json" \
  -d "$json_payload" \
  "http://localhost:3000/api/system/test-url-budget-update" | json_pp

echo ""
echo "Test complete. Check server logs for detailed information."