/* eslint-disable prettier/prettier */
// src/payment/decorators/sanitize-amount.decorator.ts
import { Transform } from 'class-transformer';
import { sanitizeAmount } from '../utils/sanitization.util';

/**
 * Decorator to sanitize amount fields in DTOs
 * Rounds amounts to 2 decimal places to prevent precision issues
 * 
 * Usage:
 * @SanitizeAmount()
 * amountPaid: number;
 */
export function SanitizeAmount() {
  return Transform(({ value }) => {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return sanitizeAmount(value);
    } catch (error) {
      // If sanitization fails, return the original value
      // Validation will catch invalid values
      return value;
    }
  });
}

