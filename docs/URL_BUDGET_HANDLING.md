# URL Budget Handling Documentation

This document explains the URL budget handling functionality that automatically updates TrafficStar campaign daily budgets based on new URLs with a 10-minute delay mechanism.

## Overview

When new URLs are added to campaigns linked with TrafficStar, the system:

1. Tracks the URL's click limit and pricing information
2. Waits exactly 10 minutes before applying budget updates
3. Combines multiple URL budget updates within the same 10-minute window
4. Updates the TrafficStar campaign's daily budget based on the calculated click pricing

## Implementation Details

### 1. Tracking New URLs

When a new URL is created or a URL's click limit is increased, the system:

- Records the URL ID, campaign ID, and TrafficStar campaign ID
- Calculates the click pricing based on click limit and price per thousand clicks
- Adds the URL to a pending queue with timestamps for:
  - `receivedAt`: When the URL was received
  - `updateAt`: Exactly 10 minutes later
  - `processed`: Flag to track when a URL has been processed

### 2. Processing Schedule

The system has a scheduled process that runs every minute to:

- Check for URLs that have passed their 10-minute waiting period
- Group URLs by TrafficStar campaign ID
- Calculate the combined click pricing for all pending URLs
- Update the TrafficStar campaign's daily budget

### 3. Budget Calculation

For each TrafficStar campaign with pending URLs:

1. Retrieve the current daily budget from TrafficStar API
2. Calculate total click pricing for all processed URLs
3. Add the click pricing to the current daily budget
4. Update the TrafficStar campaign with the new daily budget
5. Mark all processed URLs as completed

### 4. URL Changes

The system also tracks:

- Updates to URL click limits (increases only)
- Only the difference in click limit is used for budget updates
- Multiple URL changes within the 10-minute window are combined

## Testing the Feature

You can test the URL budget handling functionality using:

1. **Web Interface**: Navigate to "TrafficStar API Testing" page and use the "URL Budget Tests" tab
2. **Test API Endpoint**: Use the `/api/system/test-url-budget-update` endpoint
3. **Command Line**: Use the `test-url-budget.sh` script

### Testing Options

- **Campaign ID**: The ID of the campaign in the application
- **URL ID**: The ID of the URL in the application
- **Click Value**: (Optional) Custom click value instead of URL's click limit
- **Immediate Processing**: Skip the 10-minute wait for testing purposes

### Example Curl Command

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"campaignId":27,"urlId":123,"immediate":true}' \
  "http://localhost:3000/api/system/test-url-budget-update"
```

### Example Test Script Usage

```bash
./test-url-budget.sh -c 27 -u 123 -i
```

## Debugging

The system logs detailed information about URL budget tracking and updates:

- When URLs are added to the tracking queue
- When URLs reach their 10-minute processing time
- Budget calculations and TrafficStar API responses
- Successful budget updates and any errors encountered