import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
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
    // Set the log file path to the root directory
    this.logFilePath = path.join('.', 'Active_Url_Budget_Logs');
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
    if (!fs.existsSync(this.logFilePath)) {
      try {
        fs.writeFileSync(this.logFilePath, '');
        console.log(`Created URL budget log file at ${this.logFilePath}`);
      } catch (error) {
        console.error(`Failed to create URL budget log file: ${error}`);
      }
    }
  }

  /**
   * Log a URL budget calculation
   * @param urlId URL ID
   * @param price Price calculated for remaining clicks
   */
  public async logUrlBudget(urlId: number, price: number): Promise<void> {
    try {
      // Format date and time
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time = now.toISOString().split('T')[1].substring(0, 8); // HH:MM:SS
      
      // Format the log entry: UrlId|Price|Date::Time
      const logEntry = `${urlId}|${price.toFixed(4)}|${date}::${time}\n`;

      // Append to log file
      await fsPromises.appendFile(this.logFilePath, logEntry);
      console.log(`Logged URL budget for URL ID ${urlId}: $${price.toFixed(4)} at ${date}::${time}`);
    } catch (error) {
      console.error(`Failed to log URL budget: ${error}`);
    }
  }

  /**
   * Get all URL budget logs
   * @returns Array of log entries
   */
  public async getUrlBudgetLogs(): Promise<Array<{urlId: number, price: string, dateTime: string}>> {
    try {
      // Read the log file
      const fileContent = await fsPromises.readFile(this.logFilePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');
      
      // Parse each line
      return lines.map(line => {
        const [urlId, price, dateTime] = line.split('|');
        return {
          urlId: parseInt(urlId, 10),
          price: price,
          dateTime: dateTime
        };
      });
    } catch (error) {
      console.error(`Failed to get URL budget logs: ${error}`);
      return [];
    }
  }
}

// Export a singleton instance
const urlBudgetLogger = UrlBudgetLogger.getInstance();
export default urlBudgetLogger;