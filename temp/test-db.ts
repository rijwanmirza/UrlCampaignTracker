
import { pool } from "../server/db";

async function testDatabaseConnection() {
  try {
    // Test basic connection
    const result = await pool.query("SELECT NOW()");
    console.log("Database connection successful:", result.rows[0]);

    // Test protection_settings table access
    const protectionResult = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = protection_settings)"
    );
    console.log("Protection settings table exists:", protectionResult.rows[0].exists);

    // List all tables
    const tablesResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=public"
    );
    console.log("Available tables:", tablesResult.rows.map(row => row.table_name));

  } catch (error) {
    console.error("Database connection test failed:", error);
  }
}

testDatabaseConnection();

