/**
 * Simulation of reconciliation logic on real student data (S2406558).
 * Verifies that after reallocation: all invoices are fully paid, amountOwed = 0.
 * No DB or mocks - pure in-memory run of the same algorithm as reallocateReceiptsToInvoices.
 */

interface SimInvoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: Date;
  totalBill: number;
  amountPaidOnInvoice: number;
  balance: number;
  enrol?: { num: number; year: number };
}

interface SimReceipt {
  id: number;
  receiptNumber: string;
  amountPaid: number;
  paymentDate: Date;
}

const TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Student S2406558 (Tadiwa Museva) - invoices and receipts from user data */
function getStudentData(): { invoices: SimInvoice[]; receipts: SimReceipt[] } {
  const invoices: SimInvoice[] = [
    {
      id: 2053,
      invoiceNumber: 'INV-2026-0310',
      invoiceDate: new Date('2026-02-24T21:06:07.083Z'),
      totalBill: 1290,
      amountPaidOnInvoice: 0,
      balance: 1290,
      enrol: { num: 1, year: 2026 },
    },
    {
      id: 213,
      invoiceNumber: 'INV-DA668F',
      invoiceDate: new Date('2025-07-10T08:51:04.889Z'),
      totalBill: 1280,
      amountPaidOnInvoice: 0,
      balance: 1280,
      enrol: { num: 2, year: 2025 },
    },
    {
      id: 783,
      invoiceNumber: 'INV-55EEDA',
      invoiceDate: new Date('2025-09-10T08:46:29.607Z'),
      totalBill: 1280,
      amountPaidOnInvoice: 0,
      balance: 1280,
      enrol: { num: 3, year: 2025 },
    },
  ].sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());

  const receipts: SimReceipt[] = [
    { id: 300, receiptNumber: 'REC-9BC803', amountPaid: 900, paymentDate: new Date('2025-07-10T08:51:27.217Z') },
    { id: 301, receiptNumber: 'REC-538E2F', amountPaid: 120, paymentDate: new Date('2025-07-10T08:51:44.687Z') },
    { id: 302, receiptNumber: 'REC-DCA0E4', amountPaid: 200, paymentDate: new Date('2025-07-10T08:52:16.493Z') },
    { id: 303, receiptNumber: 'REC-7AFB61', amountPaid: 60, paymentDate: new Date('2025-07-10T08:51:59.986Z') },
    { id: 1401, receiptNumber: 'REC-FC81BB', amountPaid: 960, paymentDate: new Date('2025-10-14T18:04:45.089Z') },
    { id: 1400, receiptNumber: 'REC-0BD00C', amountPaid: 320, paymentDate: new Date('2025-10-14T18:04:18.670Z') },
    { id: 2622, receiptNumber: 'REC-2026-0098', amountPaid: 960, paymentDate: new Date('2026-01-24T07:46:38.521Z') },
    { id: 3568, receiptNumber: 'REC-2026-1028', amountPaid: 320, paymentDate: new Date('2026-02-25T06:45:45.093Z') },
    { id: 3703, receiptNumber: 'REC-2026-1155', amountPaid: 10, paymentDate: new Date('2026-02-27T20:11:37.844Z') },
  ].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());

  return { invoices, receipts };
}

/**
 * In-memory simulation of reallocateReceiptsToInvoices receipt loop + credit application.
 * Mirrors: reset all invoices, process receipts by date, use amountPaidOnInvoice for balance,
 * create credit for unallocated remainder, then apply credit to oldest invoice with balance.
 */
function simulateReconciliation(
  invoices: SimInvoice[],
  receipts: SimReceipt[],
): { invoices: SimInvoice[]; creditCreated: number; creditRemaining: number } {
  const invMap = new Map<number, SimInvoice>();
  invoices.forEach((inv) => {
    invMap.set(inv.id, { ...inv, amountPaidOnInvoice: 0, balance: inv.totalBill });
  });

  let creditBalance = 0;

  for (const receipt of receipts) {
    const receiptTime = receipt.paymentDate.getTime();
    let remaining = receipt.amountPaid;

    const eligible = invoices
      .filter((inv) => new Date(inv.invoiceDate).getTime() <= receiptTime)
      .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());

    for (const inv of eligible) {
      if (remaining <= TOLERANCE) break;
      const fresh = invMap.get(inv.id)!;
      const totalPaid = fresh.amountPaidOnInvoice;
      const balance = Math.max(0, round2(fresh.totalBill - totalPaid));
      if (balance <= TOLERANCE) continue;

      const toAlloc = Math.min(remaining, balance);
      if (toAlloc <= TOLERANCE) continue;

      fresh.amountPaidOnInvoice = round2(totalPaid + toAlloc);
      fresh.balance = round2(balance - toAlloc);
      remaining = round2(remaining - toAlloc);
    }

    if (remaining > TOLERANCE) {
      creditBalance = round2(creditBalance + remaining);
    }
  }

  // Apply credit to oldest invoice with balance (same order as service: invoiceDate ASC)
  const invoiceList = Array.from(invMap.values()).sort(
    (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
  );
  let creditRemaining = creditBalance;
  for (const inv of invoiceList) {
    if (creditRemaining <= TOLERANCE || inv.balance <= TOLERANCE) continue;
    const apply = Math.min(creditRemaining, inv.balance);
    if (apply <= TOLERANCE) continue;
    inv.amountPaidOnInvoice = round2(inv.amountPaidOnInvoice + apply);
    inv.balance = round2(inv.balance - apply);
    creditRemaining = round2(creditRemaining - apply);
  }

  return {
    invoices: invoiceList,
    creditCreated: creditBalance,
    creditRemaining,
  };
}

describe('Reconciliation simulation (S2406558)', () => {
  it('after reconciliation all invoices are paid and amountOwed is 0', () => {
    const { invoices, receipts } = getStudentData();
    const totalBilled = invoices.reduce((s, i) => s + i.totalBill, 0);
    const totalPaidReceipts = receipts.reduce((s, r) => s + r.amountPaid, 0);

    expect(totalBilled).toBe(3850);
    expect(totalPaidReceipts).toBe(3850);

    const { invoices: after, creditCreated, creditRemaining } = simulateReconciliation(
      invoices,
      receipts,
    );

    const totalPaidOnInvoices = after.reduce((s, i) => s + i.amountPaidOnInvoice, 0);
    const totalBalance = after.reduce((s, i) => s + i.balance, 0);
    const amountOwed = Math.max(0, round2(totalBilled - totalPaidReceipts));

    expect(round2(totalPaidOnInvoices)).toBe(3850);
    expect(round2(totalBalance)).toBe(0);
    expect(amountOwed).toBe(0);

    after.forEach((inv) => {
      expect(inv.balance).toBeLessThanOrEqual(TOLERANCE);
      expect(round2(inv.amountPaidOnInvoice)).toBe(inv.totalBill);
    });

    expect(round2(creditRemaining)).toBe(0);
  });

  it('allocates Jan 24 and Feb 25 receipts correctly (credit then applied to Term 1 2026)', () => {
    const { invoices, receipts } = getStudentData();
    const { invoices: after } = simulateReconciliation(invoices, receipts);

    const term1_2026 = after.find((i) => i.invoiceNumber === 'INV-2026-0310');
    const invDA = after.find((i) => i.invoiceNumber === 'INV-DA668F');
    const inv55 = after.find((i) => i.invoiceNumber === 'INV-55EEDA');

    expect(term1_2026).toBeDefined();
    expect(term1_2026!.totalBill).toBe(1290);
    expect(round2(term1_2026!.amountPaidOnInvoice)).toBe(1290);
    expect(round2(term1_2026!.balance)).toBe(0);

    expect(round2(invDA!.amountPaidOnInvoice)).toBe(1280);
    expect(round2(inv55!.amountPaidOnInvoice)).toBe(1280);
  });
});
