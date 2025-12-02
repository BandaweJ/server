-- Investigate credit sources for students S2403003 and S2502607
-- This will show where their credit came from

-- 1. Check student credit balances
SELECT 
    sc.id,
    sc."studentNumber",
    sc.amount as credit_balance,
    sc."lastCreditSource",
    sc."createdAt",
    sc."updatedAt"
FROM student_credits sc
WHERE sc."studentNumber" IN ('S2403003', 'S2502607')
ORDER BY sc."studentNumber";

-- 2. Check receipt credits (credits created from receipt overpayments)
SELECT 
    rc.id,
    rc."receiptId",
    r."receiptNumber",
    r."amountPaid" as receipt_amount,
    r."paymentDate",
    rc."creditAmount",
    rc."createdAt",
    sc."studentNumber"
FROM receipt_credits rc
JOIN student_credits sc ON rc."studentCreditId" = sc.id
JOIN receipts r ON rc."receiptId" = r.id
WHERE sc."studentNumber" IN ('S2403003', 'S2502607')
ORDER BY sc."studentNumber", rc."createdAt" DESC;

-- 3. Check credit allocations (credits applied to invoices)
SELECT 
    ca.id,
    ca."invoiceId",
    i."invoiceNumber",
    i."totalBill",
    i."amountPaidOnInvoice",
    i."balance",
    ca."amountApplied" as credit_applied,
    ca."allocationDate",
    sc."studentNumber"
FROM credit_invoice_allocations ca
JOIN student_credits sc ON ca."studentCreditId" = sc.id
JOIN invoice i ON ca."invoiceId" = i.id
WHERE sc."studentNumber" IN ('S2403003', 'S2502607')
ORDER BY sc."studentNumber", ca."allocationDate" DESC;

-- 4. Check for invoice overpayments (amountPaidOnInvoice > totalBill)
-- These would indicate credits created from invoice overpayments
SELECT 
    i.id,
    i."invoiceNumber",
    i."studentNumber",
    i."totalBill",
    i."amountPaidOnInvoice",
    i."balance",
    (i."amountPaidOnInvoice" - i."totalBill") as overpayment_amount,
    i."invoiceDate",
    i."isVoided"
FROM invoice i
WHERE i."studentNumber" IN ('S2403003', 'S2502607')
  AND i."isVoided" = false
  AND i."amountPaidOnInvoice" > i."totalBill"
ORDER BY i."studentNumber", i."invoiceDate" DESC;

-- 5. Check credit transaction history (if available)
SELECT 
    ct.id,
    ct."studentCreditId",
    sc."studentNumber",
    ct."transactionType",
    ct.amount,
    ct.description,
    ct."createdAt"
FROM credit_transactions ct
JOIN student_credits sc ON ct."studentCreditId" = sc.id
WHERE sc."studentNumber" IN ('S2403003', 'S2502607')
ORDER BY sc."studentNumber", ct."createdAt" DESC;

-- 6. Summary: Total credit created vs total credit allocated
SELECT 
    sc."studentNumber",
    sc.amount as current_credit_balance,
    COALESCE(SUM(rc."creditAmount"), 0) as total_receipt_credits,
    COALESCE(SUM(ca."amountApplied"), 0) as total_credit_allocated,
    (COALESCE(SUM(rc."creditAmount"), 0) - COALESCE(SUM(ca."amountApplied"), 0)) as calculated_balance,
    (sc.amount - (COALESCE(SUM(rc."creditAmount"), 0) - COALESCE(SUM(ca."amountApplied"), 0))) as discrepancy
FROM student_credits sc
LEFT JOIN receipt_credits rc ON sc.id = rc."studentCreditId"
LEFT JOIN credit_invoice_allocations ca ON sc.id = ca."studentCreditId"
WHERE sc."studentNumber" IN ('S2403003', 'S2502607')
GROUP BY sc.id, sc."studentNumber", sc.amount
ORDER BY sc."studentNumber";

