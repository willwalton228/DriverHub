import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Phone utilities — all logic lives in @/lib/phone.
// Re-exported here so existing callers need no changes.
export {
  cleanPhone,
  formatPhone,
  formatPhoneInput,
  validatePhone,
  sanitizePhone,
  formatPhoneNumber,
} from "@/lib/phone";
