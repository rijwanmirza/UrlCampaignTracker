import { log as viteLog } from './vite';

// Simple logger wrapper around vite.log
export const logger = {
  info: (message: string, category?: string) => {
    viteLog(message, category);
  },
  
  error: (message: string, error?: any, category?: string) => {
    let errorMessage = message;
    
    if (error) {
      if (typeof error === 'object' && error.message) {
        errorMessage += `: ${error.message}`;
      } else {
        errorMessage += `: ${error}`;
      }
    }
    
    viteLog(`❌ ERROR: ${errorMessage}`, category || 'error');
    
    // Log stack trace if available
    if (error && error.stack) {
      viteLog(`Stack trace: ${error.stack}`, category || 'error');
    }
  },
  
  warn: (message: string, category?: string) => {
    viteLog(`⚠️ WARNING: ${message}`, category || 'warning');
  },
  
  debug: (message: string, category?: string) => {
    viteLog(`🔍 DEBUG: ${message}`, category || 'debug');
  }
};