import fs from 'fs';
import path from 'path';
import readline from 'readline';

// This script sets up Gmail API configuration for bulk deletion support
// Run with: npx tsx setup-gmail-config.ts

async function setupGmailConfig() {
  console.log("Gmail API Configuration Setup");
  console.log("=============================");
  console.log("This script will help you set up the configuration needed for bulk Gmail deletion.");
  console.log("You will need to provide your Gmail email and app password.");
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

    // Create minimal credentials for Gmail API (used for deletion)
    const credentials = {
      installed: {
        client_id: "your-client-id.apps.googleusercontent.com",
        client_secret: "your-client-secret",
        redirect_uris: ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"]
      }
    };

    // Create a minimal token file
    const token = {
      access_token: "placeholder-token",
      refresh_token: "placeholder-refresh-token",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600000 // 1 hour from now
    };

    // Also check and update the IMAP settings for Gmail
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
      autoDeleteMinutes: 2
    };

    // Save credentials file
    fs.writeFileSync(
      path.join(process.cwd(), 'gmail_credentials.json'),
      JSON.stringify(credentials, null, 2)
    );

    // Save token file
    fs.writeFileSync(
      path.join(process.cwd(), 'gmail_token.json'),
      JSON.stringify(token, null, 2)
    );

    // Save or update IMAP config
    if (fs.existsSync(configFileName)) {
      const existingConfig = JSON.parse(fs.readFileSync(configFileName, 'utf8'));
      
      // Update only user, password and deletion settings
      existingConfig.user = email;
      existingConfig.password = password;
      existingConfig.autoDeleteMinutes = 2;
      
      // Keep all other existing settings
      config = existingConfig;
    }

    fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));

    console.log("\nConfiguration files created successfully!");
    console.log("This will enable the app to use Gmail API for bulk email deletion.");
    console.log("The configured deletion timeout is set to 2 minutes.");
    console.log("\nPlease restart the application to apply these changes.");

  } catch (error) {
    console.error("Error setting up Gmail configuration:", error);
  } finally {
    rl.close();
  }
}

setupGmailConfig();