import { Injectable, Logger } from '@nestjs/common';
import { InvoiceEntity } from '../entities/invoice.entity';
import { ReceiptEntity } from '../entities/payment.entity';
import {
  InvoiceValidationException,
  ReceiptValidationException,
  CreditLimitExceededException,
  MinimumPaymentAmountException,
} from '../exceptions/payment.exceptions';

/**
 * Service for comprehensive validation of financial entities (invoices, receipts)
 * before they are saved to the database.
 * 
 * This service centralizes all validation logic to ensure data integrity
 * and provide consistent error messages.
 */
@Injectable()
export class FinancialValidationService {
  private readonly logger = new Logger(FinancialValidationService.name);

  private throwInvoiceValidation(
    message: string,
    invoice?: InvoiceEntity,
    extra: Record<string, any> = {},
  ): never {
    this.logger.warn(message, {
      context: 'invoice-validation',
      invoiceNumber: invoice?.invoiceNumber,
      studentNumber: invoice?.student?.studentNumber,
      enrolmentId: invoice?.enrol?.id,
      ...extra,
    });
    throw new InvoiceValidationException(message);
  }

  private throwReceiptValidation(
    message: string,
    receipt?: ReceiptEntity,
    extra: Record<string, any> = {},
  ): never {
    this.logger.warn(message, {
      context: 'receipt-validation',
      receiptNumber: receipt?.receiptNumber,
      studentNumber: receipt?.student?.studentNumber,
      enrolmentId: receipt?.enrol?.id,
      ...extra,
    });
    throw new ReceiptValidationException(message);
  }

  /**
   * Validates an invoice before saving.
   * Throws InvoiceValidationException if validation fails.
   * 
   * @param invoice - The invoice entity to validate
   * @throws InvoiceValidationException if validation fails
   */
  validateInvoiceBeforeSave(invoice: InvoiceEntity): void {
    // 1. Validate bills exist and have fees
    if (!invoice.bills || invoice.bills.length === 0) {
      this.throwInvoiceValidation('Invoice must have at least one bill', invoice);
    }

    // Validate each bill has a fee
    for (const bill of invoice.bills) {
      if (!bill.fees) {
        this.throwInvoiceValidation(
          `Bill ${bill.id || 'unknown'} must have an associated fee`,
          invoice,
          { billId: bill.id },
        );
      }
      if (!bill.fees.amount || Number(bill.fees.amount) <= 0) {
        this.throwInvoiceValidation(
          `Bill ${bill.id || 'unknown'} must have a valid fee amount greater than zero`,
          invoice,
          { billId: bill.id, feeAmount: bill.fees.amount },
        );
      }
    }

    // 2. Validate student exists and is active
    if (!invoice.student) {
      this.throwInvoiceValidation('Invoice must be for a student', invoice);
    }

    // Note: StudentsEntity doesn't have isArchived field
    // If needed, add this check when the field is available
    // if (invoice.student.isArchived) {
    //   this.throwInvoiceValidation(
    //     `Invoice cannot be created for archived student ${invoice.student.studentNumber}`,
    //   );
    // }

    // 3. Validate enrolment exists
    if (!invoice.enrol) {
      this.throwInvoiceValidation('Invoice must be linked to an enrolment', invoice);
    }

    // 4. Validate dates
    if (!invoice.invoiceDate) {
      this.throwInvoiceValidation('Invoice date is required', invoice);
    }

    if (!invoice.invoiceDueDate) {
      this.throwInvoiceValidation('Invoice due date is required', invoice);
    }

    const invoiceDate = new Date(invoice.invoiceDate);
    const dueDate = new Date(invoice.invoiceDueDate);
    const now = new Date();

    // Invoice date cannot be in the future
    if (invoiceDate > now) {
      this.throwInvoiceValidation('Invoice date cannot be in the future', invoice, {
        invoiceDate: invoice.invoiceDate,
      });
    }

    // Due date cannot be before invoice date
    if (dueDate < invoiceDate) {
      this.throwInvoiceValidation('Due date cannot be before invoice date', invoice, {
        invoiceDate: invoice.invoiceDate,
        invoiceDueDate: invoice.invoiceDueDate,
      });
    }

    // 5. Validate amounts
    const totalBill = Number(invoice.totalBill);
    const amountPaid = Number(invoice.amountPaidOnInvoice);
    const balance = Number(invoice.balance);

    if (isNaN(totalBill) || totalBill < 0) {
      this.throwInvoiceValidation(
        'Total bill must be a valid number and cannot be negative',
        invoice,
        { totalBill: invoice.totalBill },
      );
    }

    if (isNaN(amountPaid) || amountPaid < 0) {
      this.throwInvoiceValidation(
        'Amount paid must be a valid number and cannot be negative',
        invoice,
        { amountPaidOnInvoice: invoice.amountPaidOnInvoice },
      );
    }

    if (isNaN(balance)) {
      this.throwInvoiceValidation('Balance must be a valid number', invoice);
    }

    // Balance cannot be negative for active invoices
    if (balance < 0 && !invoice.isVoided) {
      this.throwInvoiceValidation('Balance cannot be negative for active invoice', invoice, {
        balance: invoice.balance,
      });
    }

    // 6. Validate invoice number
    if (!invoice.invoiceNumber || invoice.invoiceNumber.trim() === '') {
      this.throwInvoiceValidation('Invoice number is required', invoice);
    }

    // 7. Validate status
    if (!invoice.status) {
      this.throwInvoiceValidation('Invoice status is required', invoice);
    }

    // 8. Validate exempted amount (if present)
    if (invoice.exemptedAmount !== undefined && invoice.exemptedAmount !== null) {
      const exemptedAmount = Number(invoice.exemptedAmount);
      if (isNaN(exemptedAmount) || exemptedAmount < 0) {
        this.throwInvoiceValidation(
          'Exempted amount must be a valid number and cannot be negative',
          invoice,
          { exemptedAmount: invoice.exemptedAmount },
        );
      }

      // Exempted amount should not exceed total bill
      if (exemptedAmount > totalBill) {
        this.throwInvoiceValidation(
          'Exempted amount cannot exceed total bill',
          invoice,
          { exemptedAmount: invoice.exemptedAmount, totalBill },
        );
      }
    }

    this.logger.debug('Invoice validation passed', {
      invoiceNumber: invoice.invoiceNumber,
      studentNumber: invoice.student?.studentNumber,
      totalBill,
      amountPaid,
      balance,
    });
  }

  /**
   * Validates a receipt before saving.
   * Throws ReceiptValidationException if validation fails.
   * 
   * @param receipt - The receipt entity to validate
   * @throws ReceiptValidationException if validation fails
   */
  validateReceiptBeforeSave(receipt: ReceiptEntity): void {
    // 1. Validate student exists and is active
    if (!receipt.student) {
      this.throwReceiptValidation('Receipt must be for a student', receipt);
    }

    // Note: StudentsEntity doesn't have isArchived field
    // If needed, add this check when the field is available
    // if (receipt.student.isArchived) {
    //   this.throwReceiptValidation(
    //     `Cannot create receipt for archived student ${receipt.student.studentNumber}`,
    //   );
    // }

    // 2. Validate enrolment exists
    if (!receipt.enrol) {
      this.throwReceiptValidation('Receipt must be linked to an enrolment', receipt);
    }

    // 3. Validate amount
    const amountPaid = Number(receipt.amountPaid);
    if (isNaN(amountPaid) || amountPaid <= 0) {
      this.throwReceiptValidation(
        'Receipt amount must be a valid number greater than zero',
        receipt,
        { amountPaid: receipt.amountPaid },
      );
    }

    // Minimum payment amount (business rule)
    const minimumPaymentAmount = 0.01;
    if (amountPaid < minimumPaymentAmount) {
      this.throwReceiptValidation(
        `Receipt amount must be at least ${minimumPaymentAmount}`,
        receipt,
        { amountPaid },
      );
    }

    // Maximum payment amount (business rule - prevent data entry errors)
    const maximumPaymentAmount = 1000000; // 1 million
    if (amountPaid > maximumPaymentAmount) {
      this.throwReceiptValidation(
        `Receipt amount cannot exceed ${maximumPaymentAmount}. Please verify the amount.`,
        receipt,
        { amountPaid },
      );
    }

    // 4. Validate receipt number
    if (!receipt.receiptNumber || receipt.receiptNumber.trim() === '') {
      this.throwReceiptValidation('Receipt number is required', receipt);
    }

    // 5. Validate payment date
    if (!receipt.paymentDate) {
      this.throwReceiptValidation('Payment date is required', receipt);
    }

    const paymentDate = new Date(receipt.paymentDate);
    const now = new Date();

    // Payment date cannot be too far in the future (more than 1 day)
    const maxFutureDate = new Date(now);
    maxFutureDate.setDate(maxFutureDate.getDate() + 1);
    if (paymentDate > maxFutureDate) {
      this.throwReceiptValidation(
        'Payment date cannot be more than 1 day in the future',
        receipt,
        { paymentDate: receipt.paymentDate },
      );
    }

    // Payment date cannot be too far in the past (more than 1 year)
    const minPastDate = new Date(now);
    minPastDate.setFullYear(minPastDate.getFullYear() - 1);
    if (paymentDate < minPastDate) {
      this.throwReceiptValidation(
        'Payment date cannot be more than 1 year in the past',
        receipt,
        { paymentDate: receipt.paymentDate },
      );
    }

    // 6. Validate payment method
    if (!receipt.paymentMethod) {
      this.throwReceiptValidation('Payment method is required', receipt);
    }

    // 7. Validate description
    if (!receipt.description || receipt.description.trim() === '') {
      this.throwReceiptValidation('Receipt description is required', receipt);
    }

    // 8. Validate served by
    if (!receipt.servedBy || receipt.servedBy.trim() === '') {
      this.throwReceiptValidation('Receipt must have a served by field (staff member)', receipt);
    }

    // 9. Validate allocations (if present)
    if (receipt.allocations && receipt.allocations.length > 0) {
      const totalAllocated = receipt.allocations.reduce(
        (sum, alloc) => sum + Number(alloc.amountApplied || 0),
        0,
      );

      // Allocations should not exceed receipt amount (with small tolerance for rounding)
      const tolerance = 0.01;
      if (totalAllocated > amountPaid + tolerance) {
        this.throwReceiptValidation(
          `Total allocations (${totalAllocated}) cannot exceed receipt amount (${amountPaid})`,
          receipt,
          { totalAllocated, amountPaid },
        );
      }
    }

    this.logger.debug('Receipt validation passed', {
      receiptNumber: receipt.receiptNumber,
      studentNumber: receipt.student?.studentNumber,
      amountPaid,
      paymentMethod: receipt.paymentMethod,
    });
  }

  /**
   * Validates maximum invoice amount per term (business rule).
   * This prevents data entry errors and ensures invoices don't exceed reasonable limits.
   * 
   * @param totalBill - The total bill amount for the invoice
   * @param termNum - The term number
   * @param year - The term year
   * @param existingInvoicesTotal - Total amount of existing invoices for this term (optional, for cumulative validation)
   * @param maxInvoiceAmountPerTerm - Maximum allowed invoice amount per term (default: 500,000)
   * @throws InvoiceValidationException if invoice amount exceeds maximum
   */
  validateMaximumInvoiceAmountPerTerm(
    totalBill: number,
    termNum: number,
    year: number,
    existingInvoicesTotal: number = 0,
    maxInvoiceAmountPerTerm: number = 500000,
  ): void {
    const totalForTerm = existingInvoicesTotal + totalBill;

    if (totalForTerm > maxInvoiceAmountPerTerm) {
      this.throwInvoiceValidation(
        `Total invoice amount for term ${termNum}/${year} would exceed maximum allowed amount of ${maxInvoiceAmountPerTerm}. Current term total: ${existingInvoicesTotal}, New invoice: ${totalBill}, New total: ${totalForTerm}`,
        undefined,
        { termNum, year, totalForTerm, maxInvoiceAmountPerTerm },
      );
    }

    // Also validate individual invoice amount
    if (totalBill > maxInvoiceAmountPerTerm) {
      this.throwInvoiceValidation(
        `Invoice amount (${totalBill}) cannot exceed maximum allowed amount per invoice of ${maxInvoiceAmountPerTerm}`,
        undefined,
        { termNum, year, totalBill, maxInvoiceAmountPerTerm },
      );
    }
  }

  /**
   * Validates credit balance limits (business rule).
   * This prevents excessive credit accumulation which could indicate errors or fraud.
   * 
   * @param currentCreditBalance - Current credit balance
   * @param newCreditAmount - New credit amount to add
   * @param maxCreditBalance - Maximum allowed credit balance per student (default: 100,000)
   * @throws CreditLimitExceededException if credit balance would exceed maximum
   */
  validateCreditBalanceLimit(
    currentCreditBalance: number,
    newCreditAmount: number,
    maxCreditBalance: number = 100000,
  ): void {
    const newBalance = currentCreditBalance + newCreditAmount;

    if (newBalance > maxCreditBalance) {
      this.logger.warn('Credit balance limit exceeded', {
        context: 'credit-validation',
        currentCreditBalance,
        newCreditAmount,
        maxCreditBalance,
      });
      throw new CreditLimitExceededException(
        currentCreditBalance,
        newCreditAmount,
        maxCreditBalance,
      );
    }
  }

  /**
   * Validates minimum payment amount (business rule).
   * This is already checked in validateReceiptBeforeSave, but provided as a separate
   * method for use in other contexts.
   * 
   * @param amount - The payment amount to validate
   * @param minimumAmount - Minimum allowed payment amount (default: 0.01)
   * @throws MinimumPaymentAmountException if amount is below minimum
   */
  validateMinimumPaymentAmount(
    amount: number,
    minimumAmount: number = 0.01,
  ): void {
    if (amount < minimumAmount) {
      this.logger.warn('Minimum payment amount violated', {
        context: 'payment-validation',
        amount,
        minimumAmount,
      });
      throw new MinimumPaymentAmountException(amount, minimumAmount);
    }
  }
}

