# Traffic Generator System Documentation

The Traffic Generator system automates the control of TrafficStar campaigns based on real-time status and spent values. This document outlines how the system works, its key components, and the business rules for campaign management.

## Overview

The Traffic Generator system manages linked TrafficStar campaigns by:

1. Monitoring campaign status (active/paused)
2. Tracking spent values through the TrafficStar API
3. Checking the number of remaining clicks across active URLs
4. Intelligently activating or pausing campaigns based on configurable thresholds
5. Setting proper end times for campaigns when pausing them

## Key Components

- **TrafficStar API Service**: Handles all API communication with TrafficStar
- **Traffic Generator**: Implements the business logic for campaign management
- **Campaign Database**: Stores campaign configurations and TrafficStar mappings
- **URL Database**: Tracks URLs and their click counts

## TrafficStar API Integration

The system uses the following TrafficStar API endpoints:

1. **Get Spent Value**: `/v1.1/advertiser/custom/report/by-day`
   - Used to retrieve accurate daily spending data
   - Returns amount spent, clicks, impressions, etc.

2. **Check Campaign Status**: `/v1.1/campaigns/{id}`
   - Used to verify if a campaign is active or paused
   - Provides real-time campaign information

3. **Activate Campaign**: `/v2/campaigns/run`
   - Used to start a campaign
   - Accepts an array of campaign IDs

4. **Pause Campaign**: `/v2/campaigns/pause`
   - Used to pause a campaign
   - Accepts an array of campaign IDs

5. **Update Campaign Settings**: `/v1.1/campaigns/{id}`
   - Used to update campaign end time
   - Uses PATCH method with parameters in the request body

## Business Rules

### 1. Toggle Feature

The Traffic Generator can be enabled or disabled on a per-campaign basis. When enabled:

- The system actively monitors and manages the linked TrafficStar campaign
- When disabled, no automatic changes are made to the campaign

### 2. Campaign Status Checking

Before taking any action:

- The system checks the current status of the campaign via the API
- This prevents unnecessary API calls (e.g., trying to pause an already paused campaign)

### 3. Spent Value Thresholds

Campaigns are managed based on the following thresholds:

#### When Spent Value is >= $10:

1. The campaign is immediately paused
2. A post-pause check is scheduled based on the `postPauseCheckMinutes` setting (1-30 minutes)
3. After the waiting period, the system verifies that the campaign remains paused

#### When Spent Value is < $10:

1. The system checks the remaining clicks across all active URLs
2. If remaining clicks are >= 15,000, the campaign is activated with end time set to 23:59 UTC
3. If remaining clicks are <= 5,000, the campaign is paused

### 4. Post-Pause Check Logic

After pausing a campaign, the system:

1. Waits for the configured number of minutes (default: 2 minutes)
2. Checks the campaign status via the API
3. If the campaign has been reactivated, it will pause it again
4. Logs any unexpected status changes

### 5. Campaign End Time Management

When activating a campaign:

- The end time is set to 23:59 UTC on the current day
- This prevents campaigns from running indefinitely

## Configuration Settings

Each campaign has the following Traffic Generator settings:

- `trafficGeneratorEnabled`: Boolean flag to enable/disable the feature
- `trafficstarCampaignId`: ID of the linked TrafficStar campaign
- `postPauseCheckMinutes`: Number of minutes to wait after pausing (1-30)
- `lastBudgetUpdateTime`: Timestamp of the last budget update

## Error Handling

The system implements robust error handling:

1. API communication errors are logged but don't crash the system
2. Unexpected campaign states are logged and handled gracefully
3. Rate limiting is implemented to prevent excessive API calls

## Monitoring

The system logs all actions and state changes:

- Campaign activations and pauses
- Spent value checks
- Remaining click calculations
- API errors
- Unexpected state changes

## Implementation Details

### Check Flow

```
1. Is Traffic Generator enabled for this campaign?
   ├── NO → Skip processing
   └── YES → Continue

2. Get current campaign status and spent value from TrafficStar
   
3. Is spent value >= $10?
   ├── YES → Pause campaign and set end time
   │         Wait for postPauseCheckMinutes
   │         Verify campaign remains paused
   └── NO → Continue
   
4. Check remaining clicks across all active URLs
   
5. Remaining clicks >= 15,000?
   ├── YES → Activate campaign and set end time to 23:59 UTC
   └── NO → Continue
   
6. Remaining clicks <= 5,000?
   ├── YES → Pause campaign and set end time
   └── NO → No action needed (maintain current state)
```

### Spent Value Calculation

The system uses the TrafficStar Reports API for accurate spent values:

1. Request today's spent value from `/v1.1/advertiser/custom/report/by-day`
2. Parse the response to extract the amount spent
3. Handle edge cases (null values, string formatting, etc.)
4. Use the spent value to determine campaign actions