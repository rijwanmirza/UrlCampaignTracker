# Click Protection System

## Overview

The Click Protection System prevents automatic updates to click values in URLs and campaigns during TrafficStar synchronization processes. This protection is crucial to maintain the integrity of click counts and budgets in the system.

This document explains how the Click Protection System works, how to use it, and how to troubleshoot any issues.

## Background

The URL Campaign Manager synchronizes data with TrafficStar API. During this synchronization, click values for URLs and campaigns can be automatically updated. However, this automation can sometimes lead to unintended changes in click values, especially when the TrafficStar API returns incorrect data.

The Click Protection System provides multiple layers of protection to prevent these automatic updates, while still allowing intentional manual updates through the web interface.

## Key Components

The Click Protection System consists of several key components:

1. **Database Triggers**: PostgreSQL triggers that intercept and prevent automatic updates to click values
2. **Sync Operation Tracking**: Database tables that track synchronization operations and their context
3. **Context Management Functions**: JavaScript utilities that mark operations as automatic (to be blocked) or manual
4. **Helper Functions**: SQL functions that check if protection is enabled and if an automatic sync is in progress

## How It Works

The system works by tracking the context of update operations and blocking automatic updates:

1. When a synchronization operation starts, it is marked as an automatic operation
2. PostgreSQL triggers check if an update is part of an automatic operation
3. If the update is automatic and affects click values, the update is blocked and the original values are preserved
4. Manual updates are allowed to proceed normally

This approach provides a reliable way to prevent unintended updates while still allowing administrators to make manual changes when needed.

## Database Schema

The Click Protection System uses the following database tables:

### protection_settings

Stores configuration settings for the protection system.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Setting key (primary key) |
| value | BOOLEAN | Setting value |

### sync_operations

Tracks synchronization operations for context management.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Operation ID (primary key) |
| is_auto_sync | BOOLEAN | Whether this is an automatic sync operation |
| started_at | TIMESTAMP WITH TIME ZONE | When the operation started |
| completed_at | TIMESTAMP WITH TIME ZONE | When the operation completed (NULL if ongoing) |

## PostgreSQL Functions and Triggers

The system includes the following PostgreSQL functions and triggers:

### Functions

- `click_protection_enabled()`: Checks if click protection is enabled in settings
- `is_auto_sync()`: Checks if an automatic sync operation is in progress
- `start_auto_sync()`: Starts a new automatic sync operation and returns its ID
- `end_auto_sync(operation_id)`: Ends an automatic sync operation
- `prevent_auto_click_updates()`: Trigger function that prevents updates to URL click values
- `prevent_campaign_auto_click_updates()`: Trigger function that prevents updates to campaign click values

### Triggers

- `prevent_auto_click_update_trigger`: Trigger on URLs table that calls `prevent_auto_click_updates()`
- `prevent_campaign_auto_click_update_trigger`: Trigger on campaigns table that calls `prevent_campaign_auto_click_updates()`

## JavaScript Utilities

The Click Protection System includes JavaScript utilities to manage synchronization context:

### `withAutoSyncContext(callback)`

Executes a callback function within the context of an automatic sync operation. Updates to click values within this context will be blocked.

```javascript
import { withAutoSyncContext } from './server/utils/click-protection.js';

// This update will be blocked by the protection system
await withAutoSyncContext(async () => {
  await db.execute(sql`
    UPDATE urls
    SET click_limit = ${newClickLimit}
    WHERE id = ${urlId}
  `);
});
```

### `markAsAutoSync(func)`

Marks a function as being part of an automatic sync process. Any click-related updates within this function will be blocked.

```javascript
import { markAsAutoSync } from './server/utils/click-protection.js';

// Original function
async function syncWithTrafficStar() {
  // Code that updates click values
}

// Protected function
const protectedSyncWithTrafficStar = markAsAutoSync(syncWithTrafficStar);

// Now call the protected function
await protectedSyncWithTrafficStar();
```

### `isClickProtectionEnabled()`

Checks if click protection is enabled in the database settings.

```javascript
import { isClickProtectionEnabled } from './server/utils/click-protection.js';

const protectionEnabled = await isClickProtectionEnabled();
console.log(`Click protection is ${protectionEnabled ? 'enabled' : 'disabled'}`);
```

### `setClickProtectionEnabled(enabled)`

Enables or disables click protection in the database settings.

```javascript
import { setClickProtectionEnabled } from './server/utils/click-protection.js';

// Enable click protection
await setClickProtectionEnabled(true);

// Disable click protection
await setClickProtectionEnabled(false);
```

## Installation

The Click Protection System can be installed in one of two ways:

### Method 1: Using the Migration Script

Run the migration script to apply the Click Protection System:

```bash
node migrations/click_protection.js
```

### Method 2: Using the Apply Script

Run the apply script to install the Click Protection System:

```bash
node apply-click-protection.js
```

## Testing

To verify that the Click Protection System is working correctly, use the test script:

```bash
node test-click-protection.js
```

This script performs the following tests:

1. Manual update test: Verifies that manual updates to click values work correctly
2. Automatic update test: Verifies that automatic updates to click values are blocked

## Troubleshooting

If you encounter issues with the Click Protection System, check the following:

### PostgreSQL Logs

Check the PostgreSQL logs for warnings with the prefix "Preventing automatic update":

```
WARNING: Preventing automatic update to click_limit (from 100 to 1000000) for URL 123
```

These warnings indicate that the protection system is working correctly and preventing automatic updates.

### Sync Operations Table

Check the `sync_operations` table to view the history of sync operations:

```sql
SELECT * FROM sync_operations ORDER BY started_at DESC;
```

This can help identify if sync operations are being correctly tracked and completed.

### Protection Settings

Check the `protection_settings` table to verify if protection is enabled:

```sql
SELECT * FROM protection_settings WHERE key = 'click_protection_enabled';
```

## Summary

The Click Protection System provides a robust way to prevent automatic updates to click values while allowing manual updates when needed. By using a combination of database triggers, context tracking, and JavaScript utilities, the system ensures the integrity of click data in the URL Campaign Manager.