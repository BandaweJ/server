/* eslint-disable prettier/prettier */
// src/common/transformers/number.transformer.ts (or similar path)
import { ValueTransformer } from 'typeorm';

export const numberTransformer: ValueTransformer = {
  from: (databaseValue: string | number): number => {
    if (typeof databaseValue === 'string') {
      return parseFloat(databaseValue);
    }
    return databaseValue; // Already a number (e.g., if default value or already transformed)
  },
  to: (entityValue: number): string => {
    // When saving back to the database, convert to string to preserve precision
    return entityValue.toFixed(2); // Or simply entityValue.toString();
  },
};
