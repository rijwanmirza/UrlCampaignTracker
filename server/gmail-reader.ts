import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { log } from './vite';
import { InsertUrl } from '@shared/schema';
import { storage } from './storage';
import nodemailer from 'nodemailer';
// @ts-ignore - Ignore TypeScript errors for this module since we have a declaration file
import smtpTransport from 'nodemailer-smtp-transport';
import fs from 'fs';
import path from 'path';
import { gmailService } from './gmail-service';

// Campaign assignment with click quantity limits
interface CampaignAssignment {
  campaignId: number;
  minClickLimit?: number;
  maxClickLimit?: number;
  active: boolean;
}

interface GmailConfigOptions {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  tlsOptions?: { rejectUnauthorized: boolean };
  whitelistSenders: string[];
  subjectPattern: string | RegExp;
  messagePattern: {
    orderIdRegex: RegExp;
    urlRegex: RegExp;
    quantityRegex: RegExp;
  };
  defaultCampaignId: number;
  campaignAssignments: CampaignAssignment[]; // Multiple campaign assignments with click limits
  autoDeleteMinutes: number; // Time in minutes after which processed emails should be deleted (0 = disabled)
}

// Default Gmail IMAP configuration
const defaultGmailConfig: GmailConfigOptions = {
  user: '',
  password: '',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  // Add the specific whitelisted email address
  whitelistSenders: ['help@donot-reply.in'], // The requested email address to whitelist
  // Use more general patterns that match any email with numeric values and URLs
  subjectPattern: /.*/,  // Match any subject
  messagePattern: {
    orderIdRegex: /(\d+)/,  // Any number can be an order ID
    urlRegex: /(https?:\/\/[^\s]+)/i,  // Any URL format
    quantityRegex: /(\d+)/i,  // Any number can be a quantity
  },
  defaultCampaignId: 0,
  campaignAssignments: [], // Default is empty array of campaign assignments
  autoDeleteMinutes: 60 // Default is 60 minutes (1 hour)
};

class GmailReader {
  private config: GmailConfigOptions;
  private imap!: Imap; // Using definite assignment assertion
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private deleteEmailsInterval: NodeJS.Timeout | null = null;
  private processedEmailsLogFile: string;
  private configFile: string;
  // Store processed emails with their processing dates
  private processedEmails: Map<string, string> = new Map(); // emailId -> date string
  // Track if we've done the initial scan
  private initialScanComplete = false;

  constructor(config: Partial<GmailConfigOptions> = {}) {
    this.processedEmailsLogFile = path.join(process.cwd(), 'processed_emails.log');
    this.configFile = path.join(process.cwd(), 'gmail_config.json');
    
    // Try to load saved configuration
    const savedConfig = this.loadConfig();
    
    // Merge configs with priority: passed config > saved config > default config
    this.config = { 
      ...defaultGmailConfig, 
      ...savedConfig, 
      ...config 
    };
    
    console.log('🔍 DEBUG: Gmail reader initialized with autoDeleteMinutes:', this.config.autoDeleteMinutes);
    
    this.setupImapConnection();
    this.loadProcessedEmails();
  }
  
  // Load configuration from file
  private loadConfig(): Partial<GmailConfigOptions> {
    try {
      if (fs.existsSync(this.configFile)) {
        const configData = fs.readFileSync(this.configFile, 'utf-8');
        const savedConfig = JSON.parse(configData);
        
        // Convert string patterns back to RegExp if needed
        if (savedConfig.subjectPattern && typeof savedConfig.subjectPattern === 'string') {
          savedConfig.subjectPattern = new RegExp(savedConfig.subjectPattern);
        }
        
        if (savedConfig.messagePattern) {
          if (savedConfig.messagePattern.orderIdRegex && typeof savedConfig.messagePattern.orderIdRegex === 'string') {
            savedConfig.messagePattern.orderIdRegex = new RegExp(savedConfig.messagePattern.orderIdRegex);
          }
          if (savedConfig.messagePattern.urlRegex && typeof savedConfig.messagePattern.urlRegex === 'string') {
            savedConfig.messagePattern.urlRegex = new RegExp(savedConfig.messagePattern.urlRegex);
          }
          if (savedConfig.messagePattern.quantityRegex && typeof savedConfig.messagePattern.quantityRegex === 'string') {
            savedConfig.messagePattern.quantityRegex = new RegExp(savedConfig.messagePattern.quantityRegex);
          }
        }
        
        console.log('🔍 DEBUG: Loaded saved config with autoDeleteMinutes:', savedConfig.autoDeleteMinutes);
        return savedConfig;
      }
    } catch (error) {
      console.error('Error loading Gmail reader config:', error);
    }
    return {};
  }
  
  // Save configuration to file
  private saveConfig() {
    try {
      // Create a clean version of the config for saving
      const configToSave: any = { ...this.config };
      
      // Log campaign assignments (if any) before saving
      if (configToSave.campaignAssignments && Array.isArray(configToSave.campaignAssignments)) {
        console.log('🔍 DEBUG: Saving Gmail config with campaignAssignments:', 
                   JSON.stringify(configToSave.campaignAssignments));
      } else {
        console.log('⚠️ WARNING: No campaignAssignments array found in config to save');
      }
      
      // Convert RegExp objects to strings for serialization
      if (configToSave.subjectPattern && configToSave.subjectPattern instanceof RegExp) {
        // Store as a string without the / /
        configToSave.subjectPattern = configToSave.subjectPattern.toString().slice(1, -1);
      }
      
      if (configToSave.messagePattern) {
        const patterns: any = { ...configToSave.messagePattern };
        if (patterns.orderIdRegex && patterns.orderIdRegex instanceof RegExp) {
          patterns.orderIdRegex = patterns.orderIdRegex.toString().slice(1, -1);
        }
        if (patterns.urlRegex && patterns.urlRegex instanceof RegExp) {
          patterns.urlRegex = patterns.urlRegex.toString().slice(1, -1);
        }
        if (patterns.quantityRegex && patterns.quantityRegex instanceof RegExp) {
          patterns.quantityRegex = patterns.quantityRegex.toString().slice(1, -1);
        }
        configToSave.messagePattern = patterns;
      }
      
      // Make sure autoDeleteMinutes is explicitly included
      configToSave.autoDeleteMinutes = typeof this.config.autoDeleteMinutes === 'number' 
        ? this.config.autoDeleteMinutes 
        : 0;
      
      const configJson = JSON.stringify(configToSave, null, 2);
      fs.writeFileSync(this.configFile, configJson);
      console.log('🔍 DEBUG: Saved config with autoDeleteMinutes:', configToSave.autoDeleteMinutes);
    } catch (error) {
      console.error('Error saving Gmail reader config:', error);
    }
  }
  
  // Load previously processed emails from log file
  private loadProcessedEmails() {
    try {
      if (fs.existsSync(this.processedEmailsLogFile)) {
        const logContent = fs.readFileSync(this.processedEmailsLogFile, 'utf-8');
        const emailEntries = logContent.split('\n').filter(line => line.trim().length > 0);
        
        emailEntries.forEach(entry => {
          // Format is: emailId,timestamp,status (new format) or emailId,timestamp (old format)
          const parts = entry.split(',');
          if (parts.length >= 3) {
            // New format with status
            const [emailId, timestamp, status] = parts;
            this.processedEmails.set(emailId, JSON.stringify({
              timestamp,
              status: status || 'skipped' // Default to skipped if no status
            }));
          } else if (parts.length >= 2) {
            // Old format without status - assume it was a successful processing
            const [emailId, timestamp] = parts;
            this.processedEmails.set(emailId, JSON.stringify({
              timestamp,
              status: 'success' // Assume success for backward compatibility
            }));
          } else {
            // Handle very old format entries (without date)
            const currentDate = new Date().toISOString();
            this.processedEmails.set(entry, JSON.stringify({
              timestamp: currentDate,
              status: 'unknown' // Status is unknown
            }));
          }
        });
        
        log(`Loaded ${this.processedEmails.size} previously processed email IDs`, 'gmail-reader');
      } else {
        log(`No processed emails log file found, creating a new one`, 'gmail-reader');
        fs.writeFileSync(this.processedEmailsLogFile, '', 'utf-8');
      }
    } catch (error) {
      log(`Error loading processed emails: ${error}`, 'gmail-reader');
    }
  }
  
  // Save processed emails to file
  private saveProcessedEmailsToFile() {
    try {
      const logEntries: string[] = [];
      
      this.processedEmails.forEach((data, emailId) => {
        // For each email, store its ID, timestamp, and status
        try {
          // Try to parse the data as JSON
          const parsedData = JSON.parse(data);
          // Format: emailId,timestamp,status
          logEntries.push(`${emailId},${parsedData.timestamp},${parsedData.status}`);
        } catch (e) {
          // If it's not valid JSON, use the data as a timestamp with a default status
          logEntries.push(`${emailId},${data},unknown`);
        }
      });
      
      fs.writeFileSync(this.processedEmailsLogFile, logEntries.join('\n'), 'utf-8');
      log(`Saved ${this.processedEmails.size} processed email IDs to log file`, 'gmail-reader');
    } catch (error) {
      log(`Error saving processed emails: ${error}`, 'gmail-reader');
    }
  }
  
  // Log a processed email ID with timestamp to prevent reprocessing
  // The processingStatus can be 'success', 'duplicate', 'error', or 'skipped'
  private logProcessedEmail(emailId: string, processingStatus = 'skipped') {
    try {
      if (!this.processedEmails.has(emailId)) {
        const timestamp = new Date().toISOString();
        // Format is: emailId,timestamp,status
        fs.appendFileSync(this.processedEmailsLogFile, `${emailId},${timestamp},${processingStatus}\n`, 'utf-8');
        // Store as a JSON object in memory for easier access to properties
        this.processedEmails.set(emailId, JSON.stringify({
          timestamp,
          status: processingStatus
        }));
        
        log(`Logged email ID ${emailId} as ${processingStatus} at ${timestamp}`, 'gmail-reader');
      }
    } catch (error) {
      log(`Error logging processed email: ${error}`, 'gmail-reader');
    }
  }
  
  // Check if an email has been processed before
  private hasBeenProcessed(emailId: string): boolean {
    const isProcessed = this.processedEmails.has(emailId);
    if (isProcessed) {
      log(`Skipping already processed email (ID: ${emailId})`, 'gmail-reader');
    }
    return isProcessed;
  }
  
  // Clean up processed emails log by date
  public cleanupEmailLogsByDate(options: { before?: Date, after?: Date, daysToKeep?: number } = {}) {
    try {
      let entriesToKeep: [string, string][] = [];
      let entriesRemoved = 0;
      
      // Calculate cutoff date based on daysToKeep if provided
      let beforeDate = options.before;
      if (options.daysToKeep && !beforeDate) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - options.daysToKeep);
        beforeDate = cutoffDate;
      }
      
      // Filter entries based on date criteria
      this.processedEmails.forEach((dateStr, emailId) => {
        const entryDate = new Date(dateStr);
        let keepEntry = true;
        
        if (beforeDate && entryDate < beforeDate) {
          keepEntry = false;
        }
        
        if (options.after && entryDate < options.after) {
          keepEntry = false;
        }
        
        if (keepEntry) {
          entriesToKeep.push([emailId, dateStr]);
        } else {
          entriesRemoved++;
        }
      });
      
      // Clear the log file and write back only the entries to keep
      this.processedEmails.clear();
      fs.writeFileSync(this.processedEmailsLogFile, '', 'utf-8');
      
      entriesToKeep.forEach(([emailId, dateStr]) => {
        fs.appendFileSync(this.processedEmailsLogFile, `${emailId},${dateStr}\n`, 'utf-8');
        this.processedEmails.set(emailId, dateStr);
      });
      
      log(`Cleaned up email logs: removed ${entriesRemoved} entries, kept ${entriesToKeep.length} entries`, 'gmail-reader');
      
      return {
        entriesRemoved,
        entriesKept: entriesToKeep.length
      };
    } catch (error) {
      log(`Error cleaning up email logs: ${error}`, 'gmail-reader');
      return {
        entriesRemoved: 0,
        entriesKept: this.processedEmails.size,
        error: String(error)
      };
    }
  }
  
  // Clear all email logs completely
  public clearAllEmailLogs() {
    try {
      const totalEntries = this.processedEmails.size;
      
      // Backup the current log file before clearing
      try {
        if (fs.existsSync(this.processedEmailsLogFile)) {
          const backupPath = `${this.processedEmailsLogFile}.old`;
          fs.copyFileSync(this.processedEmailsLogFile, backupPath);
          log(`Created backup of processed emails log at ${backupPath}`, 'gmail-reader');
        }
      } catch (backupError) {
        // Non-critical error, just log it
        log(`Warning: Could not create backup of processed emails log: ${backupError}`, 'gmail-reader');
      }
      
      // Clear the in-memory Map
      this.processedEmails.clear();
      
      // Clear the log file - create a completely new empty file
      fs.writeFileSync(this.processedEmailsLogFile, '', 'utf-8');
      
      log(`Cleared all email logs: removed ${totalEntries} entries`, 'gmail-reader');
      
      // Reset initial scan status so we do a fresh scan of the inbox
      this.initialScanComplete = false;
      
      return {
        success: true,
        entriesRemoved: totalEntries
      };
    } catch (error) {
      log(`Error clearing all email logs: ${error}`, 'gmail-reader');
      return {
        success: false,
        entriesRemoved: 0,
        error: String(error)
      };
    }
  }
  
  // Set up the IMAP connection
  private setupImapConnection() {
    this.imap = new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      tlsOptions: this.config.tlsOptions,
      authTimeout: 30000, // Increase auth timeout to 30 seconds
      connTimeout: 30000, // Increase connection timeout to 30 seconds
      debug: console.log // Enable debug mode to see what's happening with IMAP
    });

    this.imap.once('error', (err: Error) => {
      log(`IMAP Error: ${err.message}`, 'gmail-reader');
      this.isRunning = false;
      this.reconnect();
    });

    this.imap.once('end', () => {
      log('IMAP connection ended', 'gmail-reader');
      this.isRunning = false;
      this.reconnect();
    });
  }
  
  // Test if we can get proper write access to the mailbox (for deletion)
  private async testMailboxAccess(): Promise<{ writable: boolean, error?: string }> {
    return new Promise<{ writable: boolean, error?: string }>((resolve) => {
      try {
        if (!this.isRunning || this.imap.state !== 'authenticated') {
          resolve({ writable: false, error: 'IMAP not connected' });
          return;
        }
        
        // Skip closing the inbox - directly try to open with write access
        // This prevents errors when no mailbox is currently selected
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            log(`Failed to open inbox for writing: ${err.message}`, 'gmail-reader');
            resolve({ writable: false, error: `Failed to open inbox: ${err.message}` });
            return;
          }
          
          // Check if mailbox is marked as readOnly
          if (box && box.readOnly === true) {
            log('Mailbox is READ-ONLY. Gmail permissions issue.', 'gmail-reader');
            resolve({ 
              writable: false, 
              error: 'Mailbox is READ-ONLY. Please check your Gmail settings.' 
            });
            return;
          }
          
          // Successfully opened the mailbox for writing
          log(`Successfully opened mailbox for write access`, 'gmail-reader');
          resolve({ writable: true });
        });
      } catch (error) {
        log(`Error testing mailbox access: ${error}`, 'gmail-reader');
        resolve({ 
          writable: false, 
          error: `Error testing mailbox access: ${error}` 
        });
      }
    });
  }
  
  // Verify SMTP credentials - an alternative way to test if credentials are valid
  public async verifyCredentials(): Promise<{ success: boolean, message: string }> {
    try {
      // Create a transporter
      const transporter = nodemailer.createTransport(smtpTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: this.config.user,
          pass: this.config.password
        },
        connectionTimeout: 30000, // 30 seconds connection timeout
        greetingTimeout: 30000,   // 30 seconds greeting timeout
        socketTimeout: 30000      // 30 seconds socket timeout
      }));
      
      // Verify the connection
      await transporter.verify();
      log('SMTP connection verified successfully', 'gmail-reader');
      return { 
        success: true, 
        message: "Gmail credentials verified successfully via SMTP!" 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`SMTP verification failed: ${errorMessage}`, 'gmail-reader');
      return { 
        success: false, 
        message: `Gmail credentials verification failed: ${errorMessage}` 
      };
    }
  }

  // Attempt to reconnect to the IMAP server
  private reconnect() {
    if (!this.isRunning) {
      setTimeout(() => {
        log('Attempting to reconnect to IMAP server...', 'gmail-reader');
        this.start();
      }, 60000); // Retry every 60 seconds - increased to reduce connection attempts
    }
  }

  // Update the configuration
  public updateConfig(newConfig: Partial<GmailConfigOptions>) {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }
    
    // Debug logging for auto-delete minutes
    console.log('🔍 DEBUG: Updating Gmail config with autoDeleteMinutes:', 
                newConfig.autoDeleteMinutes !== undefined ? newConfig.autoDeleteMinutes : 'undefined');
    
    this.config = { ...this.config, ...newConfig };
    
    // Ensure auto delete minutes is correctly set (or default to 0)
    if (typeof this.config.autoDeleteMinutes !== 'number') {
      this.config.autoDeleteMinutes = 0;
    }
    
    console.log('🔍 DEBUG: Updated Gmail config autoDeleteMinutes is now:', this.config.autoDeleteMinutes);
    
    // Save configuration to file for persistence
    this.saveConfig();
    
    this.setupImapConnection();
    
    if (wasRunning) {
      this.start();
    }
    
    return this.config;
  }

  // Parse an email message
  private parseEmail(message: any): Promise<void> {
    return new Promise((resolve) => {
      let buffer = '';
      let attributes: any;
      
      // Capture message attributes (including UID, flags, etc.)
      message.on('attributes', (attrs: any) => {
        attributes = attrs;
      });
      
      message.on('body', (stream: any) => {
        stream.on('data', (chunk: any) => {
          buffer += chunk.toString('utf8');
        });
      });
      
      message.once('end', async () => {
        try {
          // Get message ID/UID for tracking
          const msgId = attributes?.uid || 'unknown';
          
          // Skip processing if we've already processed this email
          if (this.hasBeenProcessed(msgId)) {
            log(`Skipping already processed email (ID: ${msgId})`, 'gmail-reader');
            resolve();
            return;
          }
          
          log(`Processing email (ID: ${msgId})`, 'gmail-reader');
          
          const parsed = await simpleParser(buffer);
          
          // Output email details for debugging
          log(`Email ID: ${msgId}
            From: ${parsed.from?.text || 'unknown'}
            Subject: ${parsed.subject || 'no subject'}
            Date: ${parsed.date?.toISOString() || 'unknown date'}`, 'gmail-reader');
          
          // Check if sender is in whitelist - if list is empty, accept all emails
          const from = parsed.from?.text || '';
          const isWhitelistedSender = this.config.whitelistSenders.length === 0 || 
                                      this.config.whitelistSenders.some(sender => from.toLowerCase().includes(sender.toLowerCase()));
          
          if (!isWhitelistedSender) {
            log(`Skipping email from non-whitelisted sender: ${from}`, 'gmail-reader');
            resolve();
            return;
          }
          
          log(`✓ Sender ${from} is whitelisted`, 'gmail-reader');
          
          // Basic checks for URLs and quantities in the email
          // Instead of strict regex patterns, let's try to extract any URLs and numbers
          const emailText = parsed.text || '';
          
          // Log full email text for debugging
          log(`Email content (first 200 chars): ${emailText.substring(0, 200)}...`, 'gmail-reader');
          
          // Extract the first URL-like pattern
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const allUrls = emailText.match(urlRegex) || [];
          
          if (allUrls.length === 0) {
            log(`No URLs found in email content`, 'gmail-reader');
            resolve();
            return;
          }
          
          // Extract order ID from email text
          const orderIdMatch = emailText.match(/Order Id\s*:\s*(\d+)/i);
          const orderId = orderIdMatch ? orderIdMatch[1] : 
                         (parsed.subject ? 
                          parsed.subject.replace(/[^a-zA-Z0-9]/g, '-') : 
                          `order-${Date.now().toString().slice(-6)}`);
          
          // Extract quantity from email text - look specifically for quantity label
          const quantityMatch = emailText.match(/Quantity\s*:\s*(\d+)/i);
          if (!quantityMatch) {
            log(`No quantity found in email content with 'Quantity:' label`, 'gmail-reader');
            resolve();
            return;
          }
          
          // Get URL and quantity found
          const url = allUrls[0]; // URL is guaranteed to exist by previous checks
          
          // Parse quantity with sanity checks
          let extractedQuantity = parseInt(quantityMatch[1], 10);
          
          // Apply sanity limits to quantity
          let quantity = extractedQuantity;
          if (extractedQuantity > 100000) {
            log(`Unreasonably large quantity (${extractedQuantity}) found - using 1000 as default.`, 'gmail-reader');
            quantity = 1000;  // Use a reasonable default
          } else if (extractedQuantity < 1) {
            log(`Invalid quantity (${extractedQuantity}) found - using 100 as default.`, 'gmail-reader');
            quantity = 100;  // Ensure at least some clicks
          }
          
          log(`Extracted data from email:
            Order ID: ${orderId}
            URL: ${url}
            Quantity: ${quantity}
          `, 'gmail-reader');
          
          // Add URL to the appropriate campaign based on click limits
          try {
            // Determine which campaign to use based on click quantity
            let campaignId: number;
            
            // Check if we have any campaign assignments with click limits
            if (this.config.campaignAssignments && this.config.campaignAssignments.length > 0) {
              // Filter to only active campaign assignments
              const activeAssignments = this.config.campaignAssignments.filter(
                assignment => assignment.active
              );
              
              // Find a matching campaign based on min/max click limits
              const matchingAssignment = activeAssignments.find(assignment => {
                const minMatches = assignment.minClickLimit === undefined || 
                                  quantity >= assignment.minClickLimit;
                const maxMatches = assignment.maxClickLimit === undefined || 
                                  quantity <= assignment.maxClickLimit;
                
                return minMatches && maxMatches;
              });
              
              if (matchingAssignment) {
                log(`Found matching campaign ID ${matchingAssignment.campaignId} for quantity ${quantity} 
                    (min: ${matchingAssignment.minClickLimit ?? 'unlimited'}, 
                     max: ${matchingAssignment.maxClickLimit ?? 'unlimited'})`, 'gmail-reader');
                campaignId = matchingAssignment.campaignId;
              } else {
                // Fall back to default campaign if no matching assignment
                if (!this.config.defaultCampaignId) {
                  log(`No matching campaign found for quantity ${quantity} and no default campaign configured.`, 'gmail-reader');
                  this.logProcessedEmail(msgId, 'error-no-campaign-id');
                  resolve();
                  return;
                }
                campaignId = this.config.defaultCampaignId;
                log(`No matching campaign assignment found for quantity ${quantity}, using default campaign ID ${campaignId}`, 'gmail-reader');
              }
            } else {
              // No campaign assignments configured, use default campaign
              if (!this.config.defaultCampaignId) {
                log(`No default campaign ID configured. Cannot process email.`, 'gmail-reader');
                this.logProcessedEmail(msgId, 'error-no-campaign-id');
                resolve();
                return;
              }
              
              campaignId = this.config.defaultCampaignId;
            }
            
            // First check if we already have this order ID in the campaign
            // This is our first defense against duplicates
            const campaign = await storage.getCampaign(campaignId);
            if (!campaign) {
              log(`Campaign with ID ${campaignId} not found`, 'gmail-reader');
              resolve();
              return;
            }
            
            // Check if URL with this name already exists in the campaign
            const existingUrls = campaign.urls || [];
            const urlWithSameName = existingUrls.find(u => 
              u.name === orderId || u.name.startsWith(`${orderId} #`));
            
            if (urlWithSameName) {
              log(`URL with name "${orderId}" already exists in campaign ${campaignId}. Skipping.`, 'gmail-reader');
              // Log this email as a duplicate - it's also eligible for auto-delete
              this.logProcessedEmail(msgId, 'duplicate');
              resolve();
              return;
            }
            
            // Handle multiplier value (could be string or number due to numeric type in DB)
            const multiplierValue = typeof campaign.multiplier === 'string'
              ? parseFloat(campaign.multiplier)
              : (campaign.multiplier || 1);
            
            // Calculate the effective click limit based on the multiplier
            const calculatedClickLimit = Math.ceil(quantity * multiplierValue);
            
            // Prepare the URL data with both original and calculated values
            const newUrl: InsertUrl = {
              name: orderId,
              targetUrl: url || 'https://example.com', // Provide a fallback
              clickLimit: calculatedClickLimit,   // Multiplied by campaign multiplier
              originalClickLimit: quantity,       // Original value from email
              campaignId: campaignId  // Use the stored campaignId to ensure consistency
            };
            
            const createdUrl = await storage.createUrl(newUrl);
            log(`Successfully added URL to campaign ${campaignId}:
              Name: ${createdUrl.name}
              Target URL: ${createdUrl.targetUrl}
              Original Click Limit: ${quantity}
              Applied Multiplier: ${multiplierValue}x
              Calculated Click Limit: ${calculatedClickLimit}
              Status: ${createdUrl.status || 'active'}
            `, 'gmail-reader');
            
            // Log this email as successfully processed - making it eligible for auto-deletion
            // Will be deleted after the configured time interval (autoDeleteMinutes)
            this.logProcessedEmail(msgId, 'success');
          } catch (error) {
            log(`Error adding URL to campaign: ${error}`, 'gmail-reader');
          }
        } catch (error) {
          log(`Error parsing email: ${error}`, 'gmail-reader');
        }
        
        // Log the email as processed with error status if it wasn't otherwise logged
        // This prevents endless retries of emails that cause errors
        // Error-processed emails won't be eligible for auto-deletion
        if (attributes?.uid && !this.hasBeenProcessed(attributes.uid)) {
          this.logProcessedEmail(attributes.uid, 'error');
        }
        
        resolve();
      });
    });
  }

  // Clean up our processed emails log - keep only the IDs that actually exist in Gmail
  public async synchronizeProcessedEmailLog(): Promise<void> {
    if (!this.isRunning || this.imap.state !== 'authenticated') {
      log(`Cannot synchronize email log: IMAP connection not ready`, 'gmail-reader');
      return;
    }
    
    try {
      // Get actual emails in the Gmail inbox
      const actualEmails = await this.getActualGmailEmails();
      
      if (actualEmails.length === 0) {
        log(`No emails found in Gmail inbox, cannot synchronize log`, 'gmail-reader');
        return;
      }
      
      log(`Found ${actualEmails.length} actual emails in Gmail inbox for log synchronization`, 'gmail-reader');
      
      // Check each email ID in our processed log against actual Gmail inbox
      const removedIds: string[] = [];
      
      // Convert keys() iterator to array to avoid TypeScript error
      const emailIds = Array.from(this.processedEmails.keys());
      
      for (const emailId of emailIds) {
        if (!actualEmails.includes(emailId)) {
          // This email doesn't exist in Gmail, so remove it from our log
          this.processedEmails.delete(emailId);
          removedIds.push(emailId);
        }
      }
      
      // Save the updated log to the file system
      this.saveProcessedEmailsToFile();
      
      log(`Email log sync complete. Removed ${removedIds.length} non-existent email IDs from our log.`, 'gmail-reader');
    } catch (error) {
      log(`Error synchronizing email log: ${error}`, 'gmail-reader');
    }
  }
  
  // Get actual emails from Gmail inbox
  private async getActualGmailEmails(): Promise<string[]> {
    if (!this.isRunning || this.imap.state !== 'authenticated') {
      return [];
    }
    
    return new Promise<string[]>((resolve) => {
      try {
        // First check if a mailbox is already selected
        if (this.imap.state === 'selected') {
          // If we're already in a mailbox, use UID SEARCH directly
          this.imap.search(['ALL'], (err, results) => {
            if (err) {
              log(`Error searching emails: ${err.message}`, 'gmail-reader');
              resolve([]);
              return;
            }
            
            resolve(results.map(r => r.toString()));
          });
        } else {
          // Otherwise open the inbox first
          this.imap.openBox('INBOX', true, (err, box) => {
            if (err) {
              log(`Error opening inbox: ${err.message}`, 'gmail-reader');
              resolve([]);
              return;
            }
            
            this.imap.search(['ALL'], (err, results) => {
              if (err) {
                log(`Error searching emails: ${err.message}`, 'gmail-reader');
                resolve([]);
                return;
              }
              
              resolve(results.map(r => r.toString()));
            });
          });
        }
      } catch (error) {
        log(`Error in getActualGmailEmails: ${error}`, 'gmail-reader');
        resolve([]);
      }
    });
  }
  
  // Validate which emails actually exist in Gmail
  private async validateEmailsExist(emailIds: string[]): Promise<string[]> {
    // Get the actual emails in Gmail
    const actualEmails = await this.getActualGmailEmails();
    
    if (actualEmails.length === 0) {
      log(`Could not retrieve actual emails from Gmail to validate`, 'gmail-reader');
      return [];
    }
    
    // Filter the email IDs to only those that exist in Gmail
    const validEmailIds = emailIds.filter(id => actualEmails.includes(id));
    
    // Identify missing emails and clean them from our tracking
    if (validEmailIds.length < emailIds.length) {
      const missingEmails = emailIds.filter(id => !actualEmails.includes(id));
      log(`Found ${missingEmails.length} emails that no longer exist in Gmail - removing from tracking`, 'gmail-reader');
      
      // Remove these emails from our tracking to prevent future deletion attempts
      missingEmails.forEach(emailId => {
        this.processedEmails.delete(emailId);
        log(`Removed missing email ID ${emailId} from tracking system`, 'gmail-reader');
      });
      
      // Save our updated tracking data
      this.saveProcessedEmailsToFile();
    }
    
    log(`Out of ${emailIds.length} emails to delete, found ${validEmailIds.length} that actually exist in Gmail`, 'gmail-reader');
    
    return validEmailIds;
  }
  
  // Delete multiple emails at once - COMPLETE OVERHAUL that deletes ALL EMAILS AT ONCE
  private async performBulkDeletion(emailIds: string[]): Promise<number> {
    if (!this.isRunning) {
      log(`Cannot delete emails: Gmail reader not running`, 'gmail-reader');
      return 0;
    }
    
    if (emailIds.length === 0) {
      return 0;
    }
    
    log(`💥 STARTING COMPLETE BULK DELETION for ${emailIds.length} emails at once`, 'gmail-reader');
    
    try {
      // APPROACH 1: Try Gmail API first - THIS IS THE MOST RELIABLE METHOD
      log(`🔄 Attempting Gmail API bulk deletion for all ${emailIds.length} emails at once`, 'gmail-reader');
      
      try {
        // Initialize Gmail API
        const apiReady = await gmailService.trySetupGmailApi(this.config.user, this.config.password);
        
        if (apiReady) {
          log(`✅ Gmail API initialized successfully, attempting to delete ALL ${emailIds.length} emails in ONE operation`, 'gmail-reader');
          
          // Try to delete ALL emails in one shot using the Gmail API
          const deletedCount = await gmailService.trashMessages(emailIds);
          
          if (deletedCount > 0) {
            log(`🎯 BULK DELETION SUCCESS: All ${deletedCount} emails deleted at once via Gmail API!`, 'gmail-reader');
            
            // Clean up tracking regardless
            emailIds.forEach(emailId => {
              this.processedEmails.delete(emailId);
              log(`Removed email ID ${emailId} from tracking system`, 'gmail-reader');
            });
            
            // Save tracking data
            this.saveProcessedEmailsToFile();
            
            return deletedCount;
          } else {
            log(`❌ Gmail API bulk deletion failed, trying IMAP approach`, 'gmail-reader');
          }
        }
      } catch (apiError) {
        log(`Gmail API error: ${apiError}. Falling back to direct IMAP`, 'gmail-reader');
      }
      
      // APPROACH 2: If we're here, Gmail API failed - try direct batch mail deletion via IMAP
      log(`Attempting direct IMAP bulk deletion approach`, 'gmail-reader');
      
      // First validate which emails actually exist (to avoid errors with non-existent emails)
      const validEmailIds = await this.validateEmailsExist(emailIds);
      
      if (validEmailIds.length === 0) {
        log(`None of the ${emailIds.length} emails to delete actually exist in Gmail. Cleaning up our processed emails log.`, 'gmail-reader');
        await this.synchronizeProcessedEmailLog();
        return 0;
      }
      
      // We'll now try a completely different approach - we'll execute a script that deletes ALL emails at once
      log(`🔴 BULK DELETE ALL: Attempting to delete all ${validEmailIds.length} emails in one operation`, 'gmail-reader');
      
      try {
        log(`Creating connection to Gmail servers for bulk operation...`, 'gmail-reader');
        
        // We'll manually clean up and create a fresh IMAP connection for this operation
        if (this.imap.state !== 'disconnected') {
          await new Promise<void>((resolve) => {
            this.imap.end();
            setTimeout(resolve, 1000);
          });
        }
        
        // Create a fresh connection
        this.setupImapConnection();
        
        // Connect and wait for authentication
        this.imap.connect();
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);
          
          this.imap.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
          
          this.imap.once('error', (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        
        log(`New IMAP connection established for bulk deletion`, 'gmail-reader');
        
        // Open the INBOX in read-write mode
        await new Promise<void>((resolve, reject) => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) {
              log(`Error opening inbox: ${err.message}`, 'gmail-reader');
              reject(err);
              return;
            }
            log(`Opened INBOX in read-write mode successfully`, 'gmail-reader');
            resolve();
          });
        });
        
        // BULK COMMAND: Mark ALL emails with Deleted flag and then expunge ALL at once
        const emailIdsStr = validEmailIds.join(',');
        log(`Attempting to delete all these emails at once: ${emailIdsStr}`, 'gmail-reader');
        
        // First mark ALL emails with the Deleted flag
        await new Promise<void>((resolve, reject) => {
          // Use direct UID STORE command since it's more reliable for bulk operations
          this.imap.addFlags(emailIdsStr, '\\Deleted', (err) => {
            if (err) {
              log(`Error during bulk flag operation: ${err.message}`, 'gmail-reader');
              reject(err);
              return;
            }
            log(`✅ Successfully marked ALL ${validEmailIds.length} emails for deletion at once!`, 'gmail-reader');
            resolve();
          });
        });
        
        // Now expunge ALL marked emails in a single operation
        await new Promise<void>((resolve) => {
          this.imap.expunge((err) => {
            if (err) {
              log(`Error during bulk expunge: ${err.message}`, 'gmail-reader');
              resolve();
            } else {
              log(`🎯 SUCCESS! Deleted ALL ${validEmailIds.length} emails in ONE OPERATION!`, 'gmail-reader');
              resolve();
            }
          });
        });
        
        // Success - we've deleted all emails at once!
        log(`✅ BULK DELETION SUCCESS: All ${validEmailIds.length} emails deleted at once!`, 'gmail-reader');
        
        // Clean up tracking data
        validEmailIds.forEach(emailId => {
          this.processedEmails.delete(emailId);
        });
        
        // Save tracking data
        this.saveProcessedEmailsToFile();
        
        return validEmailIds.length;
      } catch (error) {
        log(`Error in bulk deletion approach: ${error}`, 'gmail-reader');
        
        // If all else fails, just clean up our tracking data
        log(`Failed to delete emails in bulk operation. Verify your Gmail settings.`, 'gmail-reader');
        
        // Clean up tracking data anyway so we don't keep trying to delete the same emails
        validEmailIds.forEach(emailId => {
          this.processedEmails.delete(emailId);
        });
        
        // Save tracking data
        this.saveProcessedEmailsToFile();
        
        return 0;
      }
    } catch (error) {
      log(`Critical error in bulk deletion: ${error}`, 'gmail-reader');
      return 0;
    }
  }
  
  // Check for emails that need to be deleted based on the autoDeleteMinutes setting
  // This implementation uses the approach from the working code
  private async checkEmailsForDeletion() {
    try {
      // Ensure autoDeleteMinutes is a number and validate it
      const autoDeleteMinutes = typeof this.config.autoDeleteMinutes === 'number' 
        ? this.config.autoDeleteMinutes 
        : 0;
        
      // Log current auto-delete settings with additional details
      log(`Running email auto-delete check with interval set to ${autoDeleteMinutes} minutes`, 'gmail-reader');
      log(`Current IMAP connection state: ${this.imap.state}`, 'gmail-reader');
      
      if (autoDeleteMinutes <= 0) {
        log(`Auto-delete is disabled (set to ${autoDeleteMinutes} minutes)`, 'gmail-reader');
        return; // Auto-delete is disabled
      }
      
      // First make sure we're properly connected to the IMAP server
      if (!this.isRunning || this.imap.state !== 'authenticated') {
        log(`Cannot check for emails to delete: IMAP not authenticated`, 'gmail-reader');
        return;
      }
      
      // Get all the emails that need to be deleted
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - (autoDeleteMinutes * 60 * 1000));
      const emailsToDelete: string[] = [];
      
      // Find all SUCCESSFULLY processed emails that were processed before the cutoff time
      log(`Scanning for processed emails older than ${cutoffTime.toISOString()} (${autoDeleteMinutes} minutes ago)`, 'gmail-reader');
      
      this.processedEmails.forEach((entryData, emailId) => {
        try {
          // Parse the stored JSON data
          let data: { timestamp: string, status: string };
          try {
            data = JSON.parse(entryData);
          } catch (e) {
            // Handle old format (just timestamp string)
            data = { 
              timestamp: entryData,
              status: 'unknown'
            };
          }
          
          const processedTime = new Date(data.timestamp);
          
          // Only delete emails that were successfully processed or duplicates
          const canDelete = data.status === 'success' || data.status === 'duplicate';
          
          if (processedTime < cutoffTime && canDelete) {
            log(`Email ID ${emailId} processed at ${processedTime.toISOString()} with status "${data.status}" is older than ${autoDeleteMinutes} minutes, marking for deletion`, 'gmail-reader');
            emailsToDelete.push(emailId);
          } else if (processedTime < cutoffTime && !canDelete) {
            log(`Email ID ${emailId} has status "${data.status}" - NOT eligible for auto-deletion`, 'gmail-reader');
          }
        } catch (err) {
          log(`Error parsing data for email ID ${emailId}: ${err}`, 'gmail-reader');
        }
      });
      
      if (emailsToDelete.length === 0) {
        log(`No emails found that are successfully processed and older than ${autoDeleteMinutes} minutes`, 'gmail-reader');
        return; // No emails to delete
      }
      
      log(`[Email Auto-Delete] Found ${emailsToDelete.length} emails that qualify for deletion (older than ${autoDeleteMinutes} minutes)`, 'gmail-reader');
      
      // Remove from tracking system first
      emailsToDelete.forEach(emailId => {
        this.processedEmails.delete(emailId);
      });
      this.saveProcessedEmailsToFile();
      log(`[Email Auto-Delete] Removed ${emailsToDelete.length} emails from tracking system`, 'gmail-reader');
      
      // Attempt physical deletion - this follows the pattern from the working code
      try {
        // Open inbox before deleting
        await new Promise<void>((resolve, reject) => {
          this.imap.openBox('INBOX', false, (err) => {
            if (err) {
              log(`Error opening inbox for deletion: ${err}`, 'gmail-reader');
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        if (emailsToDelete.length > 0) {
          log(`[Email Auto-Delete] Deleting ${emailsToDelete.length} processed emails as per settings`, 'gmail-reader');
          
          // CRITICAL PART: Add the Delete flag to emails to move them to Trash
          // This is the part that works in their code
          await new Promise<void>((resolve, reject) => {
            this.imap.addFlags(emailsToDelete, '\\Deleted', (err) => {
              if (err) {
                log(`[Email Auto-Delete] Error flagging emails for deletion: ${err}`, 'gmail-reader');
                reject(err);
              } else {
                log(`[Email Auto-Delete] Successfully marked ${emailsToDelete.length} emails for deletion`, 'gmail-reader');
                resolve();
              }
            });
          });
          
          // CRITICAL PART: Expunge to permanently remove the emails
          // This is the part that works in their code
          await new Promise<void>((resolve, reject) => {
            this.imap.expunge((expungeErr) => {
              if (expungeErr) {
                log(`[Email Auto-Delete] Error expunging deleted emails: ${expungeErr}`, 'gmail-reader');
                reject(expungeErr);
              } else {
                log(`[Email Auto-Delete] ✅ Successfully deleted ${emailsToDelete.length} emails in bulk operation`, 'gmail-reader');
                resolve();
              }
            });
          });
          
          log(`[Email Auto-Delete] Bulk deletion of ${emailsToDelete.length} emails completed successfully`, 'gmail-reader');
        } else {
          log(`[Email Auto-Delete] No valid email UIDs found for deletion`, 'gmail-reader');
        }
      } catch (deleteError) {
        log(`[Email Auto-Delete] Error during email deletion: ${deleteError}`, 'gmail-reader');
        
        // Don't worry if this fails, we've already removed the emails from tracking
        log(`Emails are already removed from tracking system, deletion status will not affect processing`, 'gmail-reader');
      }
    } catch (error) {
      log(`Error in checkEmailsForDeletion: ${error}`, 'gmail-reader');
    }
  }

  // Check for new emails
  private async checkEmails(): Promise<void> {
    if (!this.isRunning) {
      return Promise.resolve();
    }
    
    try {
      const promise = new Promise<void>((resolve, reject) => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            log(`Error opening inbox: ${err.message}`, 'gmail-reader');
            reject(err);
            return;
          }
          
          // Always search for ALL emails regardless of initialScanComplete
          // This ensures we don't miss any emails between restarts
          const searchCriteria = ['ALL'];
          
          // For Gmail specifically, we need to make sure our message format is correct
          log(`Searching for ALL messages in inbox - found in mailbox: ${box?.messages?.total || 0}`, 'gmail-reader');
          
          this.imap.search(searchCriteria, async (err, results) => {
            if (err) {
              log(`Error searching emails: ${err.message}`, 'gmail-reader');
              reject(err);
              return;
            }
            
            if (results.length === 0) {
              log('No emails found matching criteria', 'gmail-reader');
              resolve();
              return;
            }
            
            log(`Found ${results.length} emails in mailbox`, 'gmail-reader');
            
            const fetch = this.imap.fetch(results, { bodies: '', markSeen: true });
            const processedEmails: Promise<void>[] = [];
            
            fetch.on('message', (msg) => {
              processedEmails.push(this.parseEmail(msg));
            });
            
            fetch.once('error', (err) => {
              log(`Error fetching emails: ${err.message}`, 'gmail-reader');
              reject(err);
            });
            
            fetch.once('end', async () => {
              await Promise.all(processedEmails);
              log(`Finished processing batch of ${processedEmails.length} emails`, 'gmail-reader');
              
              // Mark initial scan as complete if this was the first run
              if (!this.initialScanComplete) {
                this.initialScanComplete = true;
                log('Initial email scan complete. Future scans will only process new emails.', 'gmail-reader');
              }
              
              resolve();
            });
          });
        });
      });
      
      return promise;
    } catch (error) {
      log(`Error in checkEmails: ${error}`, 'gmail-reader');
      return Promise.resolve();
    }
  }

  // Start the Gmail reader
  public start() {
    if (this.isRunning) return;
    
    if (!this.config.user || !this.config.password) {
      log('Cannot start Gmail reader: missing credentials', 'gmail-reader');
      return;
    }
    
    if (!this.config.defaultCampaignId) {
      log('Cannot start Gmail reader: missing default campaign ID', 'gmail-reader');
      return;
    }
    
    this.isRunning = true;
    
    // Make sure autoDeleteMinutes is a number for proper comparison
    if (typeof this.config.autoDeleteMinutes !== 'number') {
      this.config.autoDeleteMinutes = 0;
    }
    
    // Log the state of auto-delete when starting
    if (this.config.autoDeleteMinutes > 0) {
      log(`📧 Starting Gmail reader with auto-delete enabled: ${this.config.autoDeleteMinutes} minutes`, 'gmail-reader');
    } else {
      log('Starting Gmail reader with auto-delete disabled', 'gmail-reader');
    }
    
    this.imap.connect();
    
    this.imap.once('ready', () => {
      log('IMAP connection established', 'gmail-reader');
      
      // Check emails immediately when starting
      this.checkEmails().catch(err => {
        log(`Error in initial email check: ${err}`, 'gmail-reader');
      });
      
      // Set up interval to check emails periodically
      this.checkInterval = setInterval(() => {
        this.checkEmails().catch(err => {
          log(`Error in periodic email check: ${err}`, 'gmail-reader');
        });
      }, 300000); // Check every 5 minutes to reduce connection frequency
      
      // Configure auto-delete if enabled
      if (this.config.autoDeleteMinutes > 0) {
        log(`Auto-delete enabled: emails will be deleted ${this.config.autoDeleteMinutes} minutes after processing`, 'gmail-reader');
        
        // Check for emails to delete immediately
        this.checkEmailsForDeletion().catch(err => {
          log(`Error in initial email deletion check: ${err}`, 'gmail-reader');
        });
        
        // Set up interval to check for emails to delete based on the autoDeleteMinutes setting
        // This will check and delete emails in bulk every X minutes where X is the configured autoDeleteMinutes
        this.deleteEmailsInterval = setInterval(() => {
          log(`Running scheduled auto-delete check (${this.config.autoDeleteMinutes} minute threshold)`, 'gmail-reader');
          this.checkEmailsForDeletion().catch(err => {
            log(`Error in periodic email deletion check: ${err}`, 'gmail-reader');
          });
        }, this.config.autoDeleteMinutes * 60000); // Check at the configured interval
      } else {
        log('Auto-delete is disabled (set to 0 minutes)', 'gmail-reader');
      }
    });
  }

  // Stop the Gmail reader
  public stop() {
    log('Stopping Gmail reader...', 'gmail-reader');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.deleteEmailsInterval) {
      clearInterval(this.deleteEmailsInterval);
      this.deleteEmailsInterval = null;
    }
    
    this.isRunning = false;
    this.initialScanComplete = false; // Reset scan state for next start
    
    try {
      this.imap.end();
    } catch (error) {
      log(`Error ending IMAP connection: ${error}`, 'gmail-reader');
    }
  }

  // Get the status of the Gmail reader
  public getStatus() {
    // Debug logging for status checks
    console.log('🔍 DEBUG: Getting Gmail status, autoDeleteMinutes:', this.config.autoDeleteMinutes);
    
    // Ensure we have a valid numeric value for autoDeleteMinutes
    const autoDeleteMinutes = typeof this.config.autoDeleteMinutes === 'number' 
      ? this.config.autoDeleteMinutes 
      : 0;
    
    return {
      isRunning: this.isRunning,
      config: {
        ...this.config,
        password: this.config.password ? '******' : '', // Hide password in status
        autoDeleteMinutes: autoDeleteMinutes, // Ensure this is properly set
      },
      emailsProcessed: this.processedEmails.size,
      initialScanComplete: this.initialScanComplete
    };
  }
}

// Create a singleton instance
export const gmailReader = new GmailReader();