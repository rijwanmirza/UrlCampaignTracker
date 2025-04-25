/**
 * API Utilities
 * Common functions for API operations
 */
import axios, { AxiosRequestConfig } from 'axios';
import { db } from './db';
import { apiErrorLogs } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Retry an API operation multiple times with exponential backoff
 * @param operation Function that performs the API operation
 * @param options Retry options
 * @returns Result of the successful operation
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    actionType: string;
    maxAttempts?: number;
    delayMs?: number;
    campaignId?: string | number;
    endpoint?: string;
    method?: string;
    requestBody?: any;
  }
): Promise<T> {
  const {
    actionType,
    maxAttempts = 5,
    delayMs = 2000,
    campaignId,
    endpoint,
    method,
    requestBody
  } = options;

  let lastError: any = null;
  let retryCount = 0;
  let errorLogId: number | null = null;

  while (retryCount < maxAttempts) {
    try {
      // Try the operation
      const result = await operation();
      
      // If we get here, operation succeeded
      
      // If an error was previously logged, mark it as resolved
      if (errorLogId) {
        await db.update(apiErrorLogs)
          .set({
            resolved: true,
            resolvedAt: new Date(),
            updatedAt: new Date(),
            retryCount: retryCount,
          })
          .where(eq(apiErrorLogs.id, errorLogId));
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      retryCount++;
      
      // Format error message
      const errorMessage = error?.message || 'Unknown error';
      const statusCode = error?.response?.status;
      
      // Format campaign ID for logging
      const formattedCampaignId = campaignId ? String(campaignId) : undefined;
      
      console.error(`[API Error] ${actionType} failed (attempt ${retryCount}/${maxAttempts}): ${errorMessage}`);
      
      if (retryCount === 1) {
        // On first error, log to database
        try {
          const [insertedLog] = await db.insert(apiErrorLogs)
            .values({
              endpoint: endpoint || 'unknown',
              method: method || 'unknown',
              requestBody: requestBody || null,
              errorMessage: errorMessage,
              errorDetails: formatErrorDetails(error),
              statusCode: statusCode || null,
              campaignId: formattedCampaignId,
              actionType: actionType,
              retryCount: retryCount,
              resolved: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();
            
          errorLogId = insertedLog.id;
        } catch (logError) {
          console.error('Failed to log API error to database:', logError);
        }
      } else if (errorLogId) {
        // Update existing log with new retry count
        try {
          await db.update(apiErrorLogs)
            .set({
              retryCount: retryCount,
              updatedAt: new Date(),
              errorMessage: errorMessage, // Update with latest error
              errorDetails: formatErrorDetails(error),
              statusCode: statusCode || null,
            })
            .where(eq(apiErrorLogs.id, errorLogId));
        } catch (logError) {
          console.error('Failed to update API error log:', logError);
        }
      }
      
      // Continue retrying if we haven't hit max attempts
      if (retryCount < maxAttempts) {
        console.log(`Retrying after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Exponential backoff - increase delay for next attempt
        delayMs *= 1.5;
      }
    }
  }
  
  // If we get here, all attempts failed
  throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Format error details for storage
 */
function formatErrorDetails(error: any): any {
  if (!error) return null;
  
  // Extract useful information from the error
  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
    response: error.response ? {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
      headers: error.response.headers
    } : null
  };
}

/**
 * Helper function to make a HTTP request with retry logic
 */
export async function makeApiRequestWithRetry<T>(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    data?: any;
    actionType: string;
    campaignId?: string | number;
    maxAttempts?: number;
    timeout?: number;
  }
): Promise<T> {
  const {
    method,
    headers = {},
    data,
    actionType,
    campaignId,
    maxAttempts = 5,
    timeout = 10000
  } = options;

  return retryOperation<T>(
    async () => {
      const config: AxiosRequestConfig = {
        method,
        url,
        headers,
        timeout,
        data
      };
      
      const response = await axios(config);
      return response.data;
    },
    {
      actionType,
      maxAttempts,
      campaignId,
      endpoint: url,
      method,
      requestBody: data
    }
  );
}