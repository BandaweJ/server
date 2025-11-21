/* eslint-disable prettier/prettier */
// src/payment/utils/sanitization.util.ts

/**
 * Sanitizes a monetary amount by rounding to 2 decimal places
 * This prevents precision issues with floating point arithmetic
 * 
 * @param amount - The amount to sanitize
 * @returns The amount rounded to 2 decimal places
 * @throws Error if amount is not a valid number
 */
export function sanitizeAmount(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined) {
    throw new Error('Amount cannot be null or undefined');
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  // Round to 2 decimal places
  return Math.round(numAmount * 100) / 100;
}

/**
 * Sanitizes an optional monetary amount
 * Returns undefined if the amount is null or undefined
 * 
 * @param amount - The amount to sanitize (optional)
 * @returns The sanitized amount or undefined
 */
export function sanitizeOptionalAmount(
  amount: number | string | null | undefined,
): number | undefined {
  if (amount === null || amount === undefined) {
    return undefined;
  }

  return sanitizeAmount(amount);
}

/**
 * Sanitizes a string input by trimming whitespace
 * 
 * @param input - The string to sanitize
 * @returns The trimmed string, or undefined if input is null/undefined
 */
export function sanitizeString(
  input: string | null | undefined,
): string | undefined {
  if (input === null || input === undefined) {
    return undefined;
  }

  if (typeof input !== 'string') {
    return String(input).trim();
  }

  return input.trim();
}

