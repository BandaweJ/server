/* eslint-disable prettier/prettier */
// src/common/transformers/number.transformer.ts (or similar path)
import { ValueTransformer } from 'typeorm';

export const numberTransformer: ValueTransformer = {
  from: (databaseValue: string | number | null | undefined): number => {
    if (databaseValue === null || databaseValue === undefined) {
      return 0;
    }
    if (typeof databaseValue === 'string') {
      const parsed = parseFloat(databaseValue);
      return isNaN(parsed) ? 0 : parsed;
    }
    return databaseValue; // Already a number (e.g., if default value or already transformed)
  },
  to: (entityValue: number | null | undefined): string => {
    // When saving back to the database, convert to string to preserve precision
    if (entityValue === null || entityValue === undefined || isNaN(entityValue)) {
      return '0.00';
    }
    // Ensure it's a number before calling toFixed
    const numValue = typeof entityValue === 'number' ? entityValue : parseFloat(String(entityValue));
    if (isNaN(numValue)) {
      return '0.00';
    }
    // Validate value doesn't exceed database precision (10,2 = max 99,999,999.99)
    if (numValue > 99999999.99) {
      throw new Error(
        `Numeric field overflow: Value ${numValue} exceeds maximum allowed value (99,999,999.99)`,
      );
    }
    return numValue.toFixed(2);
  },
};
