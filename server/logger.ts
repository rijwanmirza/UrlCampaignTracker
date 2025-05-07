/**
 * Simple logger implementation
 */
export class Logger {
  info(message: string, ...args: any[]): void {
    console.log(`[youtube-api] INFO: ${message}`, ...args);
  }
  
  error(message: string, ...args: any[]): void {
    console.error(`[youtube-api] ERROR: ${message}`, ...args);
  }
  
  warn(message: string, ...args: any[]): void {
    console.warn(`[youtube-api] WARN: ${message}`, ...args);
  }
  
  debug(message: string, ...args: any[]): void {
    console.debug(`[youtube-api] DEBUG: ${message}`, ...args);
  }
}

export const logger = new Logger();