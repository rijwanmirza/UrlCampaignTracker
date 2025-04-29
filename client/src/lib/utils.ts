import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, addMinutes, addHours } from "date-fns"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | number, formatString: string = "yyyy-MM-dd HH:mm:ss") {
  if (!date) return "N/A";
  return format(new Date(date), formatString);
}

/**
 * Formats a date in Indian timezone (UTC+5:30)
 * This is used for displaying dates in Indian timezone on the client side
 */
export function formatIndianTime(date: Date | string | number): string {
  if (!date) return "N/A";
  
  // Convert to a date object
  const dateObj = new Date(date);
  
  // Add 5 hours and 30 minutes to convert from UTC to Indian time (UTC+5:30)
  const indianTime = addMinutes(addHours(dateObj, 5), 30);
  
  // Format with date and time
  return format(indianTime, "yyyy-MM-dd HH:mm:ss");
}