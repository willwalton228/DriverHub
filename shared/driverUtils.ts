import type { Driver } from "./schema";

/**
 * Computed field utilities for Driver data
 * These functions calculate derived values from stored driver information
 * NOTE: Encryption/decryption utilities are in server/driverEncryption.ts (server-only)
 */

/**
 * Compute full name from first, middle, and last names
 * NOTE: firstName/lastName are in the User table, not Driver table
 * This function returns empty string since Driver doesn't have name fields
 */
export function computeFullName(driver: Partial<Pick<Driver, any>>): string {
  // Driver table doesn't have name fields - they're in User table
  // Return empty string - name should be accessed via driver.user instead
  return "";
}

/**
 * Compute age from date of birth
 */
export function computeAge(dateOfBirth: string | Date | null): number | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Compute time on platform from hire date (returns years, months, days)
 */
export function computeTimeOnPlatform(hireDate: string | Date | null): { years: number; months: number; days: number } | null {
  if (!hireDate) return null;
  const hire = typeof hireDate === "string" ? new Date(hireDate) : hireDate;
  const today = new Date();
  
  let years = today.getFullYear() - hire.getFullYear();
  let months = today.getMonth() - hire.getMonth();
  let days = today.getDate() - hire.getDate();
  
  if (days < 0) {
    months--;
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += lastMonth.getDate();
  }
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  return { years, months, days };
}

/**
 * Compute days since last move
 */
export function computeDaysSinceLastMove(lastMoveDate: string | Date | null): number | null {
  if (!lastMoveDate) return null;
  const lastMove = typeof lastMoveDate === "string" ? new Date(lastMoveDate) : lastMoveDate;
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - lastMove.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Validate safety score value
 */
export function isValidSafetyScore(score: string): boolean {
  return ["Red", "Yellow", "Green"].includes(score);
}

/**
 * Type for Driver with computed fields
 */
export type DriverWithComputedFields = Driver & {
  fullName: string;
  age: number | null;
  timeOnPlatform: { years: number; months: number; days: number } | null;
  daysSinceLastMove: number | null;
};

/**
 * Enhance driver data with computed fields
 */
export function enhanceDriverWithComputedFields(driver: Driver): DriverWithComputedFields {
  return {
    ...driver,
    fullName: computeFullName(driver),
    age: computeAge(driver.dateOfBirth),
    timeOnPlatform: computeTimeOnPlatform(driver.hireDate),
    daysSinceLastMove: computeDaysSinceLastMove(driver.lastMoveDate),
  };
}
