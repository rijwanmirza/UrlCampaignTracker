import fs from 'fs';
import path from 'path';
import { FileHandle } from 'fs/promises';

/**
 * Class for logging URL budget calculations
 * Logs are saved in format: UrlId|Price|Date::Time in HH:MM:SEC[current UTC+00 TIME]
 */
export class UrlBudgetLogger {
  private static instance: UrlBudgetLogger;
  private logFilePath: string;
  private fileHandle: FileHandle | null = null;
  
  private constructor() {
    // Set log file path in project root directory
    this.logFilePath = path.join(process.cwd(), 'Active_Url_Budget_Logs');
    
    // Ensure log file exists
    this.ensureLogFileExists();
  }
  
  /**
   * Get singleton instance of the logger
   */
  public static getInstance(): UrlBudgetLogger {
    if (!UrlBudgetLogger.instance) {
      UrlBudgetLogger.instance = new UrlBudgetLogger();
    }
    return UrlBudgetLogger.instance;
  }
  
  /**
   * Ensure the log file exists, create if not
   */
  private ensureLogFileExists(): void {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, '');
        console.log(`Created URL budget log file at ${this.logFilePath}`);
      }
    } catch (error) {
      console.error('Error creating URL budget log file:', error);
    }
  }
  
  /**
   * Log a URL budget calculation
   * @param urlId URL ID
   * @param price Price calculated for remaining clicks
   */
  public async logUrlBudget(urlId: number, price: number): Promise<void> {
    try {
      // Format the current UTC date and time (HH:MM:SS)
      const now = new Date();
      const day = now.getUTCDate().toString().padStart(2, '0');
      const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
      const year = now.getUTCFullYear();
      const hours = now.getUTCHours().toString().padStart(2, '0');
      const minutes = now.getUTCMinutes().toString().padStart(2, '0');
      const seconds = now.getUTCSeconds().toString().padStart(2, '0');
      
      const dateTimeFormatted = `${day}-${month}-${year}::${hours}:${minutes}:${seconds}`;
      
      // Format the price with $ sign
      const priceFormatted = `$${price.toFixed(2)}`;
      
      // Create log entry in format: UrlId|Price|Date::Time
      const logEntry = `${urlId}|${priceFormatted}|${dateTimeFormatted}\n`;
      
      // Append to log file
      fs.appendFileSync(this.logFilePath, logEntry);
      
      console.log(`Logged URL budget calculation: ${logEntry.trim()}`);
    } catch (error) {
      console.error('Error logging URL budget calculation:', error);
    }
  }
  
  /**
   * Get all URL budget logs
   * @returns Array of log entries
   */
  public async getUrlBudgetLogs(): Promise<Array<{urlId: number, price: string, dateTime: string}>> {
    try {
      // Read log file
      const logContent = fs.readFileSync(this.logFilePath, 'utf-8');
      
      // Parse log entries
      const logs = logContent.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          const [urlId, price, dateTime] = line.split('|');
          return {
            urlId: parseInt(urlId),
            price,
            dateTime
          };
        });
      
      return logs;
    } catch (error) {
      console.error('Error reading URL budget logs:', error);
      return [];
    }
  }
}

// Export default instance
export default UrlBudgetLogger.getInstance();