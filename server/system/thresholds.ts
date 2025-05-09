import { db } from '../db';
import { systemSettings, campaigns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

// Constants for the setting names
const MINIMUM_CLICKS_THRESHOLD_KEY = 'minimum_clicks_threshold';
const REMAINING_CLICKS_THRESHOLD_KEY = 'remaining_clicks_threshold';

// Default values
const DEFAULT_MINIMUM_CLICKS_THRESHOLD = 5000;
const DEFAULT_REMAINING_CLICKS_THRESHOLD = 15000;

/**
 * Get the current threshold values from the database
 * @returns Object containing the threshold values
 */
export async function getThresholds() {
  try {
    // Try to get the minimum clicks threshold setting
    const minimumClicksThresholdSetting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.name, MINIMUM_CLICKS_THRESHOLD_KEY)
    });

    // Try to get the remaining clicks threshold setting
    const remainingClicksThresholdSetting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.name, REMAINING_CLICKS_THRESHOLD_KEY)
    });

    // Parse the values or use defaults
    const minimumClicksThreshold = minimumClicksThresholdSetting 
      ? parseInt(minimumClicksThresholdSetting.value) 
      : DEFAULT_MINIMUM_CLICKS_THRESHOLD;

    const remainingClicksThreshold = remainingClicksThresholdSetting 
      ? parseInt(remainingClicksThresholdSetting.value) 
      : DEFAULT_REMAINING_CLICKS_THRESHOLD;

    return {
      minimumClicksThreshold,
      remainingClicksThreshold
    };
  } catch (error) {
    console.error('Error getting threshold values:', error);
    return {
      minimumClicksThreshold: DEFAULT_MINIMUM_CLICKS_THRESHOLD,
      remainingClicksThreshold: DEFAULT_REMAINING_CLICKS_THRESHOLD
    };
  }
}

/**
 * Save threshold values to the database
 * @param minimumClicksThreshold The minimum clicks threshold value
 * @param remainingClicksThreshold The remaining clicks threshold value
 * @returns Success status
 */
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
 * @returns Object containing the campaign-specific threshold values or global defaults
 */
export async function getCampaignThresholds(campaignId: number) {
  try {
    const campaign = await db.query.campaigns.findFirst({
      where: eq(campaigns.id, campaignId),
      columns: {
        minimumClicksThreshold: true,
        remainingClicksThreshold: true
      }
    });

    if (!campaign) {
      console.warn(`Campaign ${campaignId} not found, returning global defaults`);
      // Return global defaults
      const globalDefaults = await getThresholds();
      return globalDefaults;
    }

    // Campaign exists, return its specific thresholds
    return {
      minimumClicksThreshold: campaign.minimumClicksThreshold,
      remainingClicksThreshold: campaign.remainingClicksThreshold
    };
  } catch (error) {
    console.error(`Error getting thresholds for campaign ${campaignId}:`, error);
    // Return global defaults
    const globalDefaults = await getThresholds();
    return globalDefaults;
  }
}

export async function saveThresholds(minimumClicksThreshold: number, remainingClicksThreshold: number) {
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

    console.log(`Saving threshold values: minimum=${minimumClicksThreshold}, remaining=${remainingClicksThreshold}`);
    
    // Check if minimum clicks threshold setting exists
    const existingMinimumSetting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.name, MINIMUM_CLICKS_THRESHOLD_KEY)
    });
    
    // Check if remaining clicks threshold setting exists
    const existingRemainingSetting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.name, REMAINING_CLICKS_THRESHOLD_KEY)
    });
    
    // Save minimum clicks threshold
    if (existingMinimumSetting) {
      // Update existing setting
      await db.update(systemSettings)
        .set({ 
          value: minimumClicksThreshold.toString(),
          updatedAt: new Date()
        })
        .where(eq(systemSettings.name, MINIMUM_CLICKS_THRESHOLD_KEY));
      
      console.log(`✅ Updated minimum clicks threshold to ${minimumClicksThreshold}`);
    } else {
      // Insert new setting
      await db.insert(systemSettings).values({
        name: MINIMUM_CLICKS_THRESHOLD_KEY,
        value: minimumClicksThreshold.toString(),
        displayName: 'Minimum Clicks Threshold',
        description: 'The minimum number of remaining clicks that triggers campaign pause'
      });
      
      console.log(`✅ Created minimum clicks threshold with value ${minimumClicksThreshold}`);
    }
    
    // Save remaining clicks threshold
    if (existingRemainingSetting) {
      // Update existing setting
      await db.update(systemSettings)
        .set({ 
          value: remainingClicksThreshold.toString(),
          updatedAt: new Date()
        })
        .where(eq(systemSettings.name, REMAINING_CLICKS_THRESHOLD_KEY));
      
      console.log(`✅ Updated remaining clicks threshold to ${remainingClicksThreshold}`);
    } else {
      // Insert new setting
      await db.insert(systemSettings).values({
        name: REMAINING_CLICKS_THRESHOLD_KEY,
        value: remainingClicksThreshold.toString(),
        displayName: 'Remaining Clicks Threshold',
        description: 'The minimum number of remaining clicks required for campaign auto-reactivation'
      });
      
      console.log(`✅ Created remaining clicks threshold with value ${remainingClicksThreshold}`);
    }
    
    // Also update campaign defaults for new campaigns
    try {
      // Use separate statements for each column to avoid SQL syntax errors
      await db.execute(sql`ALTER TABLE campaigns ALTER COLUMN minimum_clicks_threshold SET DEFAULT ${minimumClicksThreshold}`);
      await db.execute(sql`ALTER TABLE campaigns ALTER COLUMN remaining_clicks_threshold SET DEFAULT ${remainingClicksThreshold}`);
      
      console.log(`✅ Updated campaign defaults for new campaigns`);
    } catch (error) {
      console.warn('Could not update campaign defaults, but threshold values were saved:', error);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving threshold values:', error);
    throw error;
  }
}