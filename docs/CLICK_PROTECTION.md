# Click Protection System

This protection system ensures that click values (click_limit, clicks, total_clicks) are NEVER automatically modified.

## What's Protected

- URL click_limit values
- URL clicks counts
- Campaign total_clicks values

## How It Works

This system implements multiple layers of protection:

1. **Database Triggers**: Prevent automatic updates to click values
2. **Context Tracking**: Tracks whether an update is automatic or user-initiated
3. **Validation Functions**: Validate and sanitize any click values that are manually updated

## Implementation Details

### Database Protection

We've added PostgreSQL triggers that prevent any automatic updates to click-related fields. These triggers check a context flag to determine if an update is automatic or user-initiated.

```sql
CREATE TRIGGER prevent_auto_click_update_trigger
BEFORE UPDATE ON urls
FOR EACH ROW
EXECUTE FUNCTION prevent_auto_click_updates();
```

### Context Tracking

The system uses a database session variable to track whether an update is being performed by an automatic process or a user:

```javascript
// Mark a function as automatic
const syncFunction = markAsAutoSync(async function() {
  // Any changes made here will be prevented by the database triggers
});
```

### Validation Functions

When click values need to be manually updated, they go through strict validation:

```javascript
import { validateClickValue } from './utils/trafficstar-validator';

// This ensures values are reasonable
const safeClickValue = validateClickValue(userProvidedValue);
```

## For Developers

When working with this codebase:

1. NEVER include click-related fields in automatic updates
2. Always mark sync functions with `markAsAutoSync`
3. For manual updates, always use the validation functions

## Testing

This protection has been thoroughly tested to ensure:

1. Automatic processes cannot modify click values
2. Only explicit user actions can update click values
3. All user-provided values are validated to prevent unreasonable values

## Security

This protection system acts as a critical safeguard against:
- Data corruption from external APIs
- Integer overflow issues
- Unintended budget changes