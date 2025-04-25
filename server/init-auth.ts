/**
 * Initialize authentication
 * This script runs on application startup to ensure the admin user is properly configured
 */
import { authService } from "./services/auth-service";

const DEFAULT_ADMIN_USERNAME = "rijwamirza";
const DEFAULT_ADMIN_PASSWORD = "uiic487487";

export async function initializeAuth() {
  try {
    // Create default admin user if it doesn't exist
    const adminUser = await authService.createAdminUser(
      DEFAULT_ADMIN_USERNAME,
      DEFAULT_ADMIN_PASSWORD
    );
    
    if (adminUser) {
      console.log(`✅ Created default admin user: ${DEFAULT_ADMIN_USERNAME}`);
    } else {
      console.log("✅ Admin user already exists, skipping creation");
    }
    
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize admin user:", error instanceof Error ? error.message : "An unexpected error occurred while creating the admin user");
    return false;
  }
}