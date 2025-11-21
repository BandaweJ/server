/* eslint-disable prettier/prettier */
import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Custom exception for invoice balance mismatches.
 * This indicates a data integrity issue that requires investigation.
 */
export class InvoiceBalanceMismatchException extends BadRequestException {
  constructor(invoiceNumber: string, expected: number, actual: number) {
    super(
      `Invoice ${invoiceNumber} has a balance mismatch. Expected: ${expected.toFixed(2)}, Actual: ${actual.toFixed(2)}. This indicates a data integrity issue. Please contact support.`,
    );
    this.name = 'InvoiceBalanceMismatchException';
  }
}

/**
 * Custom exception for insufficient credit balance.
 * Thrown when attempting to apply more credit than available.
 */
export class InsufficientCreditException extends BadRequestException {
  constructor(studentNumber: string, required: number, available: number) {
    super(
      `Insufficient credit for student ${studentNumber}. Required: ${required.toFixed(2)}, Available: ${available.toFixed(2)}. Please ensure sufficient credit balance before applying.`,
    );
    this.name = 'InsufficientCreditException';
  }
}

/**
 * Custom exception for credit balance mismatches.
 * This indicates a data integrity issue that requires investigation.
 */
export class CreditBalanceMismatchException extends BadRequestException {
  constructor(studentNumber: string, expected: number, actual: number) {
    super(
      `Credit balance mismatch for student ${studentNumber}. Expected: ${expected.toFixed(2)}, Actual: ${actual.toFixed(2)}. This indicates a data integrity issue. Please contact support.`,
    );
    this.name = 'CreditBalanceMismatchException';
  }
}

/**
 * Custom exception for duplicate receipts.
 * Thrown when a receipt with the same amount is created within a short time period.
 */
export class DuplicateReceiptException extends BadRequestException {
  constructor(receiptNumber: string, amount: number, timeWindow: string = '5 minutes') {
    super(
      `Duplicate receipt detected. A recent receipt ${receiptNumber} with the same amount (${amount.toFixed(2)}) was created within the last ${timeWindow}. Please verify this is not a duplicate payment.`,
    );
    this.name = 'DuplicateReceiptException';
  }
}

/**
 * Custom exception for students not enrolled in active term.
 * Thrown when attempting to create a receipt for a student without active enrollment.
 */
export class StudentNotEnrolledException extends BadRequestException {
  constructor(studentNumber: string) {
    super(
      `Cannot create receipt for student ${studentNumber}. Student is not currently enrolled in an active term. Please verify enrollment status.`,
    );
    this.name = 'StudentNotEnrolledException';
  }
}

/**
 * Custom exception for already voided invoices.
 * Thrown when attempting to void an invoice that is already voided.
 */
export class InvoiceAlreadyVoidedException extends BadRequestException {
  constructor(invoiceId: number, invoiceNumber?: string) {
    const identifier = invoiceNumber || `ID ${invoiceId}`;
    super(
      `Invoice ${identifier} is already voided. Cannot void an invoice that has already been voided.`,
    );
    this.name = 'InvoiceAlreadyVoidedException';
  }
}

/**
 * Custom exception for already voided receipts.
 * Thrown when attempting to void a receipt that is already voided.
 */
export class ReceiptAlreadyVoidedException extends BadRequestException {
  constructor(receiptId: number, receiptNumber?: string) {
    const identifier = receiptNumber || `ID ${receiptId}`;
    super(
      `Receipt ${identifier} is already voided. Cannot void a receipt that has already been voided.`,
    );
    this.name = 'ReceiptAlreadyVoidedException';
  }
}

/**
 * Custom exception for invalid amount.
 * Thrown when an amount is invalid (negative, zero, or exceeds maximum).
 */
export class InvalidAmountException extends BadRequestException {
  constructor(fieldName: string, amount: number, reason?: string) {
    const reasonText = reason ? ` ${reason}` : '';
    super(
      `Invalid ${fieldName}: ${amount.toFixed(2)}.${reasonText} Please provide a valid amount.`,
    );
    this.name = 'InvalidAmountException';
  }
}

/**
 * Custom exception for missing required fields.
 * Thrown when required fields are missing from a request.
 */
export class MissingRequiredFieldException extends BadRequestException {
  constructor(fieldName: string, alternatives?: string[]) {
    const alternativesText = alternatives
      ? ` Provide either ${fieldName} or ${alternatives.join(' or ')}.`
      : '';
    super(
      `${fieldName} is required.${alternativesText}`,
    );
    this.name = 'MissingRequiredFieldException';
  }
}

/**
 * Custom exception for invoice validation failures.
 * Provides consistent messaging for invoice-related validation errors.
 */
export class InvoiceValidationException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceValidationException';
  }
}

/**
 * Custom exception for receipt validation failures.
 * Provides consistent messaging for receipt-related validation errors.
 */
export class ReceiptValidationException extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptValidationException';
  }
}

/**
 * Custom exception for exceeding credit balance limits.
 */
export class CreditLimitExceededException extends BadRequestException {
  constructor(currentBalance: number, attemptedAddition: number, maxBalance: number) {
    super(
      `Credit balance would exceed the maximum allowed (${maxBalance}). Current: ${currentBalance}, Attempted addition: ${attemptedAddition}, Resulting total: ${currentBalance + attemptedAddition}.`,
    );
    this.name = 'CreditLimitExceededException';
  }
}

/**
 * Custom exception for minimum payment amount violations.
 */
export class MinimumPaymentAmountException extends BadRequestException {
  constructor(amount: number, minimumAmount: number) {
    super(
      `Payment amount must be at least ${minimumAmount}. Received: ${amount}.`,
    );
    this.name = 'MinimumPaymentAmountException';
  }
}

/**
 * Custom exception for invoice not found.
 * Provides more context than generic NotFoundException.
 */
export class InvoiceNotFoundException extends NotFoundException {
  constructor(identifier: string | number) {
    const id = typeof identifier === 'string' ? identifier : `ID ${identifier}`;
    super(
      `Invoice ${id} not found. Please verify the invoice exists and try again.`,
    );
    this.name = 'InvoiceNotFoundException';
  }
}

/**
 * Custom exception for receipt not found.
 * Provides more context than generic NotFoundException.
 */
export class ReceiptNotFoundException extends NotFoundException {
  constructor(identifier: string | number) {
    const id = typeof identifier === 'string' ? identifier : `ID ${identifier}`;
    super(
      `Receipt ${id} not found. Please verify the receipt exists and try again.`,
    );
    this.name = 'ReceiptNotFoundException';
  }
}

/**
 * Custom exception for student not found.
 * Provides more context than generic NotFoundException.
 */
export class StudentNotFoundException extends NotFoundException {
  constructor(studentNumber: string, context?: string) {
    const contextText = context ? ` ${context}` : '';
    super(
      `Student with number ${studentNumber} not found.${contextText} Please verify the student number and try again.`,
    );
    this.name = 'StudentNotFoundException';
  }
}

/**
 * Custom exception for enrolment not found.
 * Provides more context than generic NotFoundException.
 */
export class EnrolmentNotFoundException extends NotFoundException {
  constructor(studentNumber: string, termNum: number, year: number) {
    super(
      `Enrolment not found for student ${studentNumber}, term ${termNum}/${year}. Please verify the student is enrolled in this term.`,
    );
    this.name = 'EnrolmentNotFoundException';
  }
}

