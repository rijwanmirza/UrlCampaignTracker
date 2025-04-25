/**
 * API Utilities
 * Common functions for API operations
 */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { db } from './db';
import { apiErrorLogs } from '@shared/schema';

/**
 * Retry options for API operations
 */
interface RetryOptions {
  // Type of action being performed (for logging)
  actionType: string;
  // ID of the campaign involved (optional)
  campaignId?: number;
  // Request details for logging
  endpoint?: string;
  method?: string;
  requestBody?: any;
  // Maximum number of retry attempts
  maxAttempts?: number;
  // Initial delay between retries in milliseconds
  delayMs?: number;
}

/**
 * Retry an API operation multiple times with exponential backoff
 * @param operation Function that performs the API operation
 * @param options Retry options
 * @returns Result of the successful operation
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3;
  const initialDelayMs = options.delayMs || 2000;
  
  let attempt = 1;
  let lastError: any = null;
  
  while (attempt <= maxAttempts) {
    try {
      // Try the operation
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt}/${maxAttempts} failed:`, error.message || error);
      
      // Log the error if this is the first attempt or the last attempt
      if (attempt === 1 || attempt === maxAttempts) {
        try {
          await db.insert(apiErrorLogs).values({
            actionType: options.actionType,
            campaignId: options.campaignId?.toString(),
            endpoint: options.endpoint,
            method: options.method,
            requestBody: options.requestBody ? JSON.stringify(options.requestBody) : null,
            errorMessage: error.message || 'Unknown error',
            errorDetails: formatErrorDetails(error),
            retryCount: attempt,
            resolved: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        } catch (logError) {
          console.error('Failed to log API error:', logError);
        }
      }
      
      // If we've reached max attempts, throw the last error
      if (attempt >= maxAttempts) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      // Each retry waits longer than the previous one
      const nextDelayMs = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`Waiting ${nextDelayMs}ms before retry ${attempt + 1}/${maxAttempts}...`);
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, nextDelayMs));
      
      // Increment attempt counter
      attempt++;
    }
  }
  
  // This should never be reached, but TypeScript requires a return
  throw lastError;
}

/**
 * Format error details for storage
 */
function formatErrorDetails(error: any): any {
  if (!error) return null;
  
  // Return a structured object with useful error information
  const details: any = {};
  
  // Include response data if available
  if (error.response) {
    details.status = error.response.status;
    details.statusText = error.response.statusText;
    details.data = error.response.data;
    details.headers = {};
    
    // Only include essential headers
    const headerKeys = ['content-type', 'date', 'request-id', 'x-request-id'];
    for (const key of headerKeys) {
      if (error.response.headers[key]) {
        details.headers[key] = error.response.headers[key];
      }
    }
  }
  
  // Include request information if available
  if (error.config) {
    details.request = {
      url: error.config.url,
      method: error.config.method,
      timeout: error.config.timeout
    };
  }
  
  // Include any stack trace for debugging
  if (error.stack) {
    details.stack = error.stack.split('\n').slice(0, 3).join('\n');
  }
  
  return JSON.stringify(details);
}

/**
 * Helper function to make a HTTP request with retry logic
 */
export async function makeApiRequestWithRetry<T>(
  url: string,
  options: {
    method: string;
    data?: any;
    params?: any;
    actionType: string;
    campaignId?: number;
    maxAttempts?: number;
    timeoutMs?: number;
  }
): Promise<AxiosResponse<T>> {
  const { method, data, params, actionType, campaignId, maxAttempts, timeoutMs } = options;
  
  return retryOperation(
    async () => {
      const config: AxiosRequestConfig = {
        method,
        url,
        data,
        params,
        timeout: timeoutMs || 30000 // Default 30 second timeout
      };
      
      return await axios.request<T>(config);
    },
    {
      actionType,
      campaignId,
      endpoint: url,
      method,
      requestBody: data,
      maxAttempts: maxAttempts || 3,
      delayMs: 2000
    }
  );
}