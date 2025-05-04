# Traffic Generator Feature Documentation

The Traffic Generator automatically manages TrafficStar campaigns based on spent value thresholds and remaining clicks. This document explains the key functions and processing logic.

## Core Functions

### 1. Get Campaign Status

The system always uses real-time campaign status from the TrafficStar API:

```typescript
export async function getTrafficStarCampaignStatus(trafficstarCampaignId: string)
```

This function retrieves the current status of a TrafficStar campaign (active, paused, etc.) by fetching the campaign details directly from the API. No cached values are used.

### 2. Get Campaign Spent Value

```typescript
export async function getTrafficStarCampaignSpentValue(campaignId: number, trafficstarCampaignId: string)
```

This function fetches the current spent value for a campaign using three methods in order:
1. From the campaign object itself (if it contains a 'spent' property)
2. From the dedicated spent value endpoints (multiple formats are tried)
3. From our database (if we have a stored value)

If no value can be found, it returns 0 (not as a fallback, but as a real representation that we don't have spent data).

### 3. Handle Campaign By Spent Value

```typescript
export async function handleCampaignBySpentValue(campaignId: number, trafficstarCampaignId: string, spentValue: number)
```

This function implements the core logic of the Traffic Generator:

- For campaigns with **less than $10 spent**:
  - Checks remaining clicks across all active URLs
  - If remaining clicks ≥ 15,000 and campaign is not active: Reactivates it with end time set to 23:59 UTC today
  - If remaining clicks ≤ 5,000 and campaign is active: Pauses it and sets end time to current time
  - If campaign is reactivated: Starts minute-by-minute monitoring to ensure it stays active
  - If campaign is paused: Starts minute-by-minute monitoring to ensure it stays paused

- For campaigns with **$10+ spent**:
  - Marks them as 'high_spend' but doesn't take any specific action

### 4. Minute-by-Minute Monitoring

Two monitoring functions are implemented:

```typescript
function startMinutelyStatusCheck(campaignId: number, trafficstarCampaignId: string)
function startMinutelyPauseStatusCheck(campaignId: number, trafficstarCampaignId: string)
```

The first function checks active campaigns every minute and reactivates them if they become paused.
The second function checks paused campaigns every minute and re-pauses them if they become active.

### 5. Process Traffic Generator

```typescript
export async function processTrafficGenerator(campaignId: number, forceMode?: string)
```

This function orchestrates the entire process for a single campaign:
1. Checks if Traffic Generator is enabled for the campaign
2. Gets the TrafficStar campaign ID
3. Fetches current spent value
4. Processes the campaign based on spent value

### 6. Run For All Campaigns

```typescript
export async function runTrafficGeneratorForAllCampaigns()
```

This function identifies all campaigns with Traffic Generator enabled and processes each one.

## Wait Period After Pause

After a campaign is paused, the system waits for 2 minutes before taking any further action based on spent value. This allows time for TrafficStar to update its spent value data and prevents rapid activation-pause cycles.

## API Integration

This implementation relies on direct API calls to TrafficStar, with no fallbacks to mock/test data. All status checks, spending values, and campaign actions are performed via authenticated API calls.

The system tries multiple API endpoints and parameter formats to maximize compatibility with the TrafficStar API.