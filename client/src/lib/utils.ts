import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | number, formatString: string = "yyyy-MM-dd HH:mm:ss") {
  if (!date) return "N/A";
  return format(new Date(date), formatString);
}