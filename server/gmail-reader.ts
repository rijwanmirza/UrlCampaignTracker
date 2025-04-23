import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { log } from './vite';
import { InsertUrl } from '@shared/schema';
import { storage } from './storage';

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
}

// Default Gmail IMAP configuration
const defaultGmailConfig: GmailConfigOptions = {
  user: '',
  password: '',
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  whitelistSenders: ['help@donot-reply.in'], // Added the requested email to whitelist
  subjectPattern: /New Order Received (\d+)/,
  messagePattern: {
    orderIdRegex: /Order Id\s*:\s*(\d+)/i,
    urlRegex: /Url\s*:\s*(https?:\/\/[^\s]+)/i,
    quantityRegex: /Quantity\s*:\s*(\d+)/i,
  },
  defaultCampaignId: 0
};

class GmailReader {
  private config: GmailConfigOptions;
  private imap: Imap;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<GmailConfigOptions> = {}) {
    this.config = { ...defaultGmailConfig, ...config };
    this.imap = new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      tlsOptions: this.config.tlsOptions,
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
    
    this.config = { ...this.config, ...newConfig };
    
    this.imap = new Imap({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      tls: this.config.tls,
      tlsOptions: this.config.tlsOptions,
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
    
    if (wasRunning) {
      this.start();
    }
    
    return this.config;
  }

  private parseEmail(message: any): Promise<void> {
    return new Promise((resolve) => {
      let buffer = '';
      
      message.on('body', (stream: any) => {
        stream.on('data', (chunk: any) => {
          buffer += chunk.toString('utf8');
        });
      });
      
      message.once('end', async () => {
        try {
          const parsed = await simpleParser(buffer);
          
          // Check if sender is in whitelist
          const from = parsed.from?.text || '';
          const isWhitelistedSender = this.config.whitelistSenders.length === 0 || 
                                      this.config.whitelistSenders.some(sender => from.includes(sender));
          
          if (!isWhitelistedSender) {
            log(`Skipping email from non-whitelisted sender: ${from}`, 'gmail-reader');
            resolve();
            return;
          }
          
          // Check subject pattern
          const subject = parsed.subject || '';
          const subjectMatch = typeof this.config.subjectPattern === 'string' 
            ? subject.includes(this.config.subjectPattern)
            : this.config.subjectPattern.test(subject);
            
          if (!subjectMatch) {
            log(`Skipping email with non-matching subject: ${subject}`, 'gmail-reader');
            resolve();
            return;
          }
          
          // Extract details from email body
          const text = parsed.text || '';
          
          const orderIdMatch = text.match(this.config.messagePattern.orderIdRegex);
          const urlMatch = text.match(this.config.messagePattern.urlRegex);
          const quantityMatch = text.match(this.config.messagePattern.quantityRegex);
          
          if (orderIdMatch && urlMatch && quantityMatch) {
            const orderId = orderIdMatch[1];
            const url = urlMatch[1];
            const quantity = parseInt(quantityMatch[1], 10);
            
            log(`Found valid order in email:
              Order ID: ${orderId}
              URL: ${url}
              Quantity: ${quantity}
            `, 'gmail-reader');
            
            // Add URL to the campaign
            try {
              // Fetch the campaign to check for multiplier
              const campaign = await storage.getCampaign(this.config.defaultCampaignId);
              const multiplier = campaign?.multiplier || 1;
              
              // Calculate the effective click limit based on the multiplier
              const calculatedClickLimit = quantity * multiplier;
              
              // Prepare the URL data with both original and calculated values
              const newUrl: InsertUrl = {
                name: orderId,
                targetUrl: url,
                clickLimit: calculatedClickLimit,   // Multiplied by campaign multiplier
                originalClickLimit: quantity,       // Original value from email
                campaignId: this.config.defaultCampaignId
              };
              
              const createdUrl = await storage.createUrl(newUrl);
              log(`Successfully added URL to campaign ${this.config.defaultCampaignId}:
                Name: ${createdUrl.name}
                Target URL: ${createdUrl.targetUrl}
                Original Click Limit: ${quantity}
                Applied Multiplier: ${multiplier}x
                Calculated Click Limit: ${calculatedClickLimit}
                Status: ${createdUrl.status || 'active'}
              `, 'gmail-reader');
            } catch (error) {
              log(`Error adding URL to campaign: ${error}`, 'gmail-reader');
            }
          } else {
            log('Email does not match the required pattern', 'gmail-reader');
          }
        } catch (error) {
          log(`Error parsing email: ${error}`, 'gmail-reader');
        }
        
        resolve();
      });
    });
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
          
          // Search for unread messages
          this.imap.search(['UNSEEN'], async (err, results) => {
            if (err) {
              log(`Error searching emails: ${err.message}`, 'gmail-reader');
              reject(err);
              return;
            }
            
            if (results.length === 0) {
              log('No new emails found', 'gmail-reader');
              resolve();
              return;
            }
            
            log(`Found ${results.length} new emails`, 'gmail-reader');
            
            const fetch = this.imap.fetch(results, { bodies: '' });
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
    });
  }

  public stop() {
    log('Stopping Gmail reader...', 'gmail-reader');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    this.isRunning = false;
    
    try {
      this.imap.end();
    } catch (error) {
      log(`Error ending IMAP connection: ${error}`, 'gmail-reader');
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      config: {
        ...this.config,
        password: this.config.password ? '******' : '', // Hide password in status
      }
    };
  }
}

// Create a singleton instance
export const gmailReader = new GmailReader();