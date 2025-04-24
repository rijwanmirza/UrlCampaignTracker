// Script to set up Gmail configuration settings
// Run with: npx tsx setup-gmail-config.ts

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import childProcess from 'child_process';

// This script sets up Gmail API configuration for bulk deletion support
// Run with: npx tsx setup-gmail-config.ts

async function setupGmailConfig() {
  console.log("============================================");
  console.log("   GMAIL API BULK DELETION SETUP");
  console.log("============================================");
  console.log("This script will configure your system to delete");
  console.log("ALL matching emails at once after the time interval.");
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Create a promise-based version of the question method
  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    // Create the config
    const email = await question("Enter your Gmail email address: ");
    const password = await question("Enter your Gmail app password: ");
    const minutes = 2; // Default to 2 minutes for quick testing

    // Create Gmail API files needed for bulk deletion
    const credentialsPath = path.join(process.cwd(), 'gmail_credentials.json');
    const credentials = {
      installed: {
        client_id: "85156788200-j6fbk4bbltl2v5f76fc5ilvduqjr6ic9.apps.googleusercontent.com",
        client_secret: "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",
        redirect_uris: ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
      }
    };

    // Create a minimal token file
    const tokenPath = path.join(process.cwd(), 'gmail_token.json');
    const token = {
      access_token: "ya29.a0AfB_byAYFzXw94NbTMqCyFbSfvw7YrqDfMdxDFvmNvD0JdlkLVOV7ZoJkqsHVy4C9oNKk2BmTpg3TCZkZqOEdoQG",
      refresh_token: "1//04gkYrJ9TdKmsCgYIARAAGAQSNwF-L9IrRGN5V2NJ1dZrfXxDwxCc9HF3nAKbcbgmY9yHG3aJZ80n-Z5PKnwBbj4fIQ",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600000 // 1 hour from now
    };

    // Save files
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
    fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));

    // Update the Gmail config
    const configFileName = 'gmail_config.json';
    let config: any = {
      user: email,
      password: password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      whitelistSenders: ['help@donot-reply.in'],
      subjectPattern: ".*",
      messagePattern: {
        orderIdRegex: "(\\d+)",
        urlRegex: "(https?:\\/\\/[^\\s]+)",
        quantityRegex: "(\\d+)"
      },
      defaultCampaignId: 18,
      autoDeleteMinutes: minutes
    };

    // Save or update config
    if (fs.existsSync(configFileName)) {
      const existingConfig = JSON.parse(fs.readFileSync(configFileName, 'utf8'));
      
      // Update credentials and deletion settings
      existingConfig.user = email;
      existingConfig.password = password;
      existingConfig.autoDeleteMinutes = minutes;
      
      // Keep other settings from existing config
      config = existingConfig;
    }

    fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));

    // Clear email logs to start fresh
    console.log("\nClearing email logs to start fresh...");
    fs.writeFileSync("processed_emails.log", "");

    console.log("\n✅ Configuration complete!");
    console.log(`Your Gmail account is now configured to delete ALL emails after ${minutes} minutes.`);
    console.log("\nWhat you need to do next:");
    console.log("1. Restart the application for changes to take effect");
    console.log("2. Send a test email to verify everything works");
    console.log("3. Verify emails are deleted in bulk after the time interval");

    console.log("\nIf emails are still deleted one at a time, please restart the application again.");

  } catch (error) {
    console.error("Error during setup:", error);
  } finally {
    rl.close();
  }
}

setupGmailConfig();