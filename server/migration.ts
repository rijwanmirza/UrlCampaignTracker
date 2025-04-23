import { db } from './db';
import { urls } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Migration script to set the original click limit for existing URLs
 * This sets originalClickLimit = clickLimit for existing records
 */
async function migrateOriginalClickLimit() {
  try {
    console.log('Starting migration of originalClickLimit...');
    
    // Get all existing URLs
    const allUrls = await db.select().from(urls);
    console.log(`Found ${allUrls.length} URLs to migrate`);
    
    // For each URL, set originalClickLimit = clickLimit if it's not set
    for (const url of allUrls) {
      if (!url.originalClickLimit) {
        await db
          .update(urls)
          .set({ originalClickLimit: url.clickLimit })
          .where(eq(urls.id, url.id));
        
        console.log(`Updated URL ${url.id}: originalClickLimit set to ${url.clickLimit}`);
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
migrateOriginalClickLimit();