import { db } from '../db';
import { campaigns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

// Default values
const DEFAULT_MINIMUM_CLICKS_THRESHOLD = 5000;
const DEFAULT_REMAINING_CLICKS_THRESHOLD = 15000;

/**
 * Update thresholds for a specific campaign
 * @param campaignId The ID of the campaign to update
 * @param minimumClicksThreshold The minimum clicks threshold value
 * @param remainingClicksThreshold The remaining clicks threshold value
 * @returns Success status
 */
export async function updateCampaignThresholds(
  campaignId: number, 
  minimumClicksThreshold: number, 
  remainingClicksThreshold: number
) {
  try {
    // Validate inputs
    if (isNaN(minimumClicksThreshold) || minimumClicksThreshold <= 0) {
      throw new Error('Minimum clicks threshold must be a positive number');
    }

    if (isNaN(remainingClicksThreshold) || remainingClicksThreshold <= 0) {
      throw new Error('Remaining clicks threshold must be a positive number');
    }

    if (remainingClicksThreshold <= minimumClicksThreshold) {
      throw new Error('Remaining clicks threshold must be greater than minimum clicks threshold');
    }

    console.log(`Updating thresholds for campaign ${campaignId}: minimum=${minimumClicksThreshold}, remaining=${remainingClicksThreshold}`);

    // Update the campaign
    await db.update(campaigns)
      .set({
        minimumClicksThreshold,
        remainingClicksThreshold,
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId));

    console.log(`✅ Updated thresholds for campaign ${campaignId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error updating thresholds for campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Get thresholds for a specific campaign
 * @param campaignId The ID of the campaign
 * @returns Object containing the campaign-specific threshold values or defaults
 */
export async function getCampaignThresholds(campaignId: number) {
  try {
    const campaign = await db.select({
      minimumClicksThreshold: campaigns.minimumClicksThreshold,
      remainingClicksThreshold: campaigns.remainingClicksThreshold
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .then(records => records[0]);

    if (!campaign) {
      console.warn(`Campaign ${campaignId} not found, returning default values`);
      // Return default values
      return {
        minimumClicksThreshold: DEFAULT_MINIMUM_CLICKS_THRESHOLD,
        remainingClicksThreshold: DEFAULT_REMAINING_CLICKS_THRESHOLD
      };
    }

    // Use campaign's specific thresholds or default values if not set
    const thresholds = {
      minimumClicksThreshold: campaign.minimumClicksThreshold || DEFAULT_MINIMUM_CLICKS_THRESHOLD,
      remainingClicksThreshold: campaign.remainingClicksThreshold || DEFAULT_REMAINING_CLICKS_THRESHOLD
    };

    console.log(`Using campaign-specific thresholds for campaign ${campaignId}: ` +
                `minimum=${thresholds.minimumClicksThreshold}, remaining=${thresholds.remainingClicksThreshold}`);

    return thresholds;
  } catch (error) {
    console.error(`Error getting thresholds for campaign ${campaignId}:`, error);
    // Return default values
    return {
      minimumClicksThreshold: DEFAULT_MINIMUM_CLICKS_THRESHOLD,
      remainingClicksThreshold: DEFAULT_REMAINING_CLICKS_THRESHOLD
    };
  }
}

/**
 * @deprecated Global thresholds are deprecated. Use campaign-specific thresholds instead.
 */
export async function getThresholds() {
  console.warn('⚠️ DEPRECATED: getThresholds() function called - Global thresholds have been deprecated');
  return {
    minimumClicksThreshold: DEFAULT_MINIMUM_CLICKS_THRESHOLD,
    remainingClicksThreshold: DEFAULT_REMAINING_CLICKS_THRESHOLD
  };
}

/**
 * @deprecated Global thresholds are deprecated. Use updateCampaignThresholds() instead.
 */
export async function saveThresholds() {
  console.warn('⚠️ DEPRECATED: saveThresholds() function called - Global thresholds have been deprecated');
  return { success: false, message: 'Global thresholds have been deprecated' };
}

/**
 * Update the default threshold values for new campaigns
 * This function is for database administration only
 */
export async function updateDefaultThresholds(
  minimumClicksThreshold: number,
  remainingClicksThreshold: number
) {
  try {
    // Validate inputs
    if (isNaN(minimumClicksThreshold) || minimumClicksThreshold <= 0) {
      throw new Error('Minimum clicks threshold must be a positive number');
    }

    if (isNaN(remainingClicksThreshold) || remainingClicksThreshold <= 0) {
      throw new Error('Remaining clicks threshold must be a positive number');
    }

    if (remainingClicksThreshold <= minimumClicksThreshold) {
      throw new Error('Remaining clicks threshold must be greater than minimum clicks threshold');
    }

    console.log(`Updating default thresholds for new campaigns: minimum=${minimumClicksThreshold}, remaining=${remainingClicksThreshold}`);

    // Use separate statements for each column to avoid SQL syntax errors
    await db.execute(sql`ALTER TABLE campaigns ALTER COLUMN minimum_clicks_threshold SET DEFAULT ${minimumClicksThreshold}`);
    await db.execute(sql`ALTER TABLE campaigns ALTER COLUMN remaining_clicks_threshold SET DEFAULT ${remainingClicksThreshold}`);
    
    console.log(`✅ Updated threshold defaults for new campaigns`);
    return { success: true };
  } catch (error) {
    console.error('Error updating default thresholds:', error);
    throw error;
  }
}