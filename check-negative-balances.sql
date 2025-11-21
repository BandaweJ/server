-- Query to find invoices with negative balances that are NOT voided
-- These are the invoices causing the constraint violation

SELECT 
    id,
    "invoiceNumber",
    "invoiceDate",
    balance,
    "totalBill",
    "amountPaidOnInvoice",
    "isVoided",
    "voidedAt",
    "voidedBy",
    status
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
ORDER BY balance ASC;

-- Count of violating invoices
SELECT COUNT(*) as violating_invoice_count
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL);

-- Summary by status
SELECT 
    status,
    COUNT(*) as count,
    MIN(balance) as min_balance,
    MAX(balance) as max_balance,
    AVG(balance) as avg_balance
FROM invoice
WHERE balance < 0 
  AND ("isVoided" = false OR "isVoided" IS NULL)
GROUP BY status;

