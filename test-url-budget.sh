#!/bin/bash

# Default values
CAMPAIGN_ID=27
URL_ID=""
CLICK_VALUE=""
IMMEDIATE=false

# Parse command line arguments
while getopts ":c:u:v:i" opt; do
  case ${opt} in
    c )
      CAMPAIGN_ID=$OPTARG
      ;;
    u )
      URL_ID=$OPTARG
      ;;
    v )
      CLICK_VALUE=$OPTARG
      ;;
    i )
      IMMEDIATE=true
      ;;
    \? )
      echo "Invalid option: $OPTARG" 1>&2
      exit 1
      ;;
    : )
      echo "Invalid option: $OPTARG requires an argument" 1>&2
      exit 1
      ;;
  esac
done

echo "Running URL Budget Test with the following parameters:"
echo "Campaign ID: $CAMPAIGN_ID"
echo "URL ID: $URL_ID"
echo "Click Value: $CLICK_VALUE"
echo "Processing: $([ "$IMMEDIATE" = true ] && echo "Immediate" || echo "Delayed")"
echo ""
echo "Executing test..."

# Execute the test
if [ -n "$URL_ID" ] && [ -n "$CLICK_VALUE" ]; then
  # Test single URL with specific click value
  RESULT=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer TraffiCS10928" \
    -d "{\"campaignId\": $CAMPAIGN_ID, \"urlId\": $URL_ID, \"clickValue\": $CLICK_VALUE, \"immediate\": $IMMEDIATE}" \
    "http://localhost:3000/api/system/test-url-budget-update")
else
  # Use Node.js script for more comprehensive test
  node test-url-budget.js
fi

# Format and display the result if it's JSON
echo $RESULT | json_pp 2>/dev/null || echo $RESULT

echo ""
echo "Test complete. Check server logs for detailed information."