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
  autoDeleteMinutes: 0 // Default is 0 (disabled)
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
          // Format is: emailId,timestamp
          const parts = entry.split(',');
          if (parts.length >= 2) {
            const [emailId, timestamp] = parts;
            this.processedEmails.set(emailId, timestamp);
          } else {
            // Handle old format entries (without date)
            const currentDate = new Date().toISOString();
            this.processedEmails.set(entry, currentDate);
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
  
  // Log a processed email ID with timestamp to prevent reprocessing
  private logProcessedEmail(emailId: string) {
    try {
      if (!this.processedEmails.has(emailId)) {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(this.processedEmailsLogFile, `${emailId},${timestamp}\n`, 'utf-8');
        this.processedEmails.set(emailId, timestamp);
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
      
      // Clear the in-memory Map
      this.processedEmails.clear();
      
      // Clear the log file
      fs.writeFileSync(this.processedEmailsLogFile, '', 'utf-8');
      
      log(`Cleared all email logs: removed ${totalEntries} entries`, 'gmail-reader');
      
      // Reset initial scan status
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

  private reconnect() {
    if (!this.isRunning) {
      setTimeout(() => {
        log('Attempting to reconnect to IMAP server...', 'gmail-reader');
        this.start();
      }, 60000); // Retry every 60 seconds - increased to reduce connection attempts
    }
  }

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
          
          // Add URL to the campaign
          try {
            // First check if we already have this order ID in the campaign
            // This is our first defense against duplicates
            const campaign = await storage.getCampaign(this.config.defaultCampaignId);
            if (!campaign) {
              log(`Campaign with ID ${this.config.defaultCampaignId} not found`, 'gmail-reader');
              resolve();
              return;
            }
            
            // Check if URL with this name already exists in the campaign
            const existingUrls = campaign.urls || [];
            const urlWithSameName = existingUrls.find(u => 
              u.name === orderId || u.name.startsWith(`${orderId} #`));
            
            if (urlWithSameName) {
              log(`URL with name "${orderId}" already exists in campaign ${this.config.defaultCampaignId}. Skipping.`, 'gmail-reader');
              // Log this email as processed even though we're skipping it
              this.logProcessedEmail(msgId);
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
              campaignId: this.config.defaultCampaignId
            };
            
            const createdUrl = await storage.createUrl(newUrl);
            log(`Successfully added URL to campaign ${this.config.defaultCampaignId}:
              Name: ${createdUrl.name}
              Target URL: ${createdUrl.targetUrl}
              Original Click Limit: ${quantity}
              Applied Multiplier: ${multiplierValue}x
              Calculated Click Limit: ${calculatedClickLimit}
              Status: ${createdUrl.status || 'active'}
            `, 'gmail-reader');
            
            // Log this email as processed to prevent duplicate processing
            this.logProcessedEmail(msgId);
          } catch (error) {
            log(`Error adding URL to campaign: ${error}`, 'gmail-reader');
          }
        } catch (error) {
          log(`Error parsing email: ${error}`, 'gmail-reader');
        }
        
        // Log the email as processed even if there was an error
        // This prevents endless retries of emails that cause errors
        if (attributes?.uid && !this.hasBeenProcessed(attributes.uid)) {
          this.logProcessedEmail(attributes.uid);
        }
        
        resolve();
      });
    });
  }

  // Track if we've done the initial scan
  private initialScanComplete = false;
  
  // Delete a specific email by its UID
  private deleteEmail(uid: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.isRunning || this.imap.state !== 'authenticated') {
        log(`Cannot delete email: IMAP connection not ready`, 'gmail-reader');
        resolve(false);
        return;
      }
      
      try {
        // Open the inbox
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            log(`Error opening mailbox for deletion: ${err.message}`, 'gmail-reader');
            resolve(false);
            return;
          }
          
          // Add the Deleted flag to the message
          this.imap.addFlags(uid, '\\Deleted', (err) => {
            if (err) {
              log(`Error adding Deleted flag to email ${uid}: ${err.message}`, 'gmail-reader');
              resolve(false);
              return;
            }
            
            // Expunge the mailbox to permanently remove the message
            this.imap.expunge((err) => {
              if (err) {
                log(`Error expunging mailbox after deletion: ${err.message}`, 'gmail-reader');
                resolve(false);
                return;
              }
              
              log(`Successfully deleted email with ID: ${uid}`, 'gmail-reader');
              resolve(true);
            });
          });
        });
      } catch (error) {
        log(`Unexpected error in deleteEmail: ${error}`, 'gmail-reader');
        resolve(false);
      }
    });
  }
  
  // Check for emails that need to be deleted based on the autoDeleteMinutes setting
  private async checkEmailsForDeletion() {
    if (this.config.autoDeleteMinutes <= 0) {
      return; // Auto-delete is disabled
    }
    
    try {
      const now = new Date();
      const cutoffTime = new Date(now.getTime() - (this.config.autoDeleteMinutes * 60 * 1000));
      const emailsToDelete: string[] = [];
      
      // Find all emails that have been processed before the cutoff time
      this.processedEmails.forEach((timestampStr, emailId) => {
        const processedTime = new Date(timestampStr);
        if (processedTime < cutoffTime) {
          emailsToDelete.push(emailId);
        }
      });
      
      if (emailsToDelete.length === 0) {
        return; // No emails to delete
      }
      
      log(`Found ${emailsToDelete.length} processed emails older than ${this.config.autoDeleteMinutes} minutes to delete`, 'gmail-reader');
      
      // Delete each email
      let deletedCount = 0;
      for (const emailId of emailsToDelete) {
        const success = await this.deleteEmail(emailId);
        if (success) {
          deletedCount++;
        }
      }
      
      log(`Auto-deleted ${deletedCount}/${emailsToDelete.length} emails older than ${this.config.autoDeleteMinutes} minutes`, 'gmail-reader');
    } catch (error) {
      log(`Error in checkEmailsForDeletion: ${error}`, 'gmail-reader');
    }
  }

  private async checkEmails() {
    if (!this.isRunning) return;
    
    try {
      return new Promise<void>((resolve, reject) => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            log(`Error opening inbox: ${err.message}`, 'gmail-reader');
            reject(err);
            return;
          }
          
          // Search for all messages on initial run, then only unseen ones after
          // This ensures we process existing messages too
          const searchCriteria = this.initialScanComplete ? ['UNSEEN'] : ['ALL'];
          log(`Searching for ${searchCriteria.join(', ')} messages in inbox`, 'gmail-reader');
          
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
    } catch (error) {
      log(`Error in checkEmails: ${error}`, 'gmail-reader');
    }
  }

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
    
    log('Starting Gmail reader...', 'gmail-reader');
    
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
      
      // Set up auto-delete interval if enabled
      if (this.config.autoDeleteMinutes > 0) {
        log(`Auto-delete enabled: emails will be deleted ${this.config.autoDeleteMinutes} minutes after processing`, 'gmail-reader');
        
        // Check for emails to delete immediately
        this.checkEmailsForDeletion().catch(err => {
          log(`Error in initial email deletion check: ${err}`, 'gmail-reader');
        });
        
        // Set up interval to check for emails to delete periodically (every 5 minutes)
        this.deleteEmailsInterval = setInterval(() => {
          this.checkEmailsForDeletion().catch(err => {
            log(`Error in periodic email deletion check: ${err}`, 'gmail-reader');
          });
        }, 300000); // Check every 5 minutes
      }
    });
  }

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