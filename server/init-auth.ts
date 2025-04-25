/**
 * Initialize authentication
 * This script runs on application startup to ensure the admin user is properly configured
 */
import { authService } from "./services/auth-service";

const DEFAULT_ADMIN_USERNAME = "rijwamirza";
const DEFAULT_ADMIN_PASSWORD = "uiic487487";

export async function initializeAuth() {
  try {
    console.log("Initializing authentication system...");
    
    // Create the default admin user if not exists
    const result = await authService.createAdminUser(
      DEFAULT_ADMIN_USERNAME, 
      DEFAULT_ADMIN_PASSWORD
    );
    
    if (result.success) {
      console.log(`✅ ${result.message}`);
    } else {
      console.error(`❌ Failed to initialize admin user: ${result.message}`);
    }
  } catch (error) {
    console.error("Error initializing authentication:", error);
  }
}