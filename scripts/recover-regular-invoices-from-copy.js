#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Recover overwritten regular-term invoices in production by copying invoice bills
 * and billing totals from a PITR copy database.
 *
 * Safe defaults:
 * - Dry-run by default (no writes).
 * - Only targets invoices where PROD has vacation fees on a regular term
 *   and COPY has non-vacation fees for the same invoiceNumber.
 *
 * Required environment variables:
 * - PROD_DATABASE_URL   (live/production database URL)
 * - COPY_DATABASE_URL   (PITR copy database URL)
 * - TERM_NUM            (e.g. 1)
 * - TERM_YEAR           (e.g. 2026)
 *
 * Optional environment variables:
 * - APPLY=true          (actually write changes; otherwise dry-run)
 * - CLASS_NAME=...      (limit to one class, e.g. "2A")
 * - STUDENT_NUMBER=...  (limit to one student)
 */

const { Client } = require('pg');

const VACATION_FEE_NAMES = new Set([
  'vacationTuitionDay',
  'vacationTuitionBoarder',
]);

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function parseIntEnv(name) {
  const value = requireEnv(name);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Env var ${name} must be an integer. Received: ${value}`);
  }
  return parsed;
}

function normalizeFeeList(csv) {
  if (!csv) return [];
  return String(csv)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .sort();
}

function hasVacationFee(feeNames) {
  return feeNames.some((name) => VACATION_FEE_NAMES.has(name));
}

async function loadInvoices(client, { termNum, termYear, className, studentNumber }) {
  const params = [termNum, termYear];
  let whereSql = `
    e.num = $1
    AND e.year = $2
    AND COALESCE(t.type, 'regular') = 'regular'
    AND COALESCE(i."isVoided", false) = false
  `;

  if (className) {
    params.push(className);
    whereSql += ` AND e.name = $${params.length}`;
  }

  if (studentNumber) {
    params.push(studentNumber);
    whereSql += ` AND s."studentNumber" = $${params.length}`;
  }

  const sql = `
    SELECT
      i.id AS invoice_id,
      i."invoiceNumber" AS invoice_number,
      i."studentId" AS student_id,
      i."enrolId" AS enrol_id,
      i."totalBill"::numeric AS total_bill,
      i."exemptedAmount"::numeric AS exempted_amount,
      s."studentNumber" AS student_number,
      e.name AS class_name,
      COALESCE(
        STRING_AGG(DISTINCT f.name, ',' ORDER BY f.name),
        ''
      ) AS fee_names_csv,
      COALESCE(
        ARRAY_AGG(DISTINCT f.id) FILTER (WHERE f.id IS NOT NULL),
        ARRAY[]::int[]
      ) AS fee_ids
    FROM invoice i
    JOIN students s ON s.id = i."studentId"
    JOIN enrol e ON e.id = i."enrolId"
    LEFT JOIN terms t ON t.id = e."termId"
    LEFT JOIN bills b ON b."invoiceId" = i.id
    LEFT JOIN fees f ON f.id = b."feesId"
    WHERE ${whereSql}
    GROUP BY
      i.id,
      i."invoiceNumber",
      i."studentId",
      i."enrolId",
      i."totalBill",
      i."exemptedAmount",
      s."studentNumber",
      e.name
    ORDER BY s."studentNumber", i."invoiceNumber";
  `;

  const { rows } = await client.query(sql, params);
  return rows.map((row) => ({
    invoiceId: Number(row.invoice_id),
    invoiceNumber: row.invoice_number,
    studentId: Number(row.student_id),
    enrolId: Number(row.enrol_id),
    totalBill: Number(row.total_bill || 0),
    exemptedAmount: Number(row.exempted_amount || 0),
    studentNumber: row.student_number,
    className: row.class_name,
    feeNames: normalizeFeeList(row.fee_names_csv),
    feeIds: Array.isArray(row.fee_ids) ? row.fee_ids.map(Number).sort((a, b) => a - b) : [],
  }));
}

function buildRecoveryPlan(prodInvoices, copyInvoices) {
  const copyByInvoiceNumber = new Map(
    copyInvoices.map((inv) => [inv.invoiceNumber, inv]),
  );

  const plan = [];
  const skipped = [];

  for (const prod of prodInvoices) {
    const copy = copyByInvoiceNumber.get(prod.invoiceNumber);
    if (!copy) {
      skipped.push({
        invoiceNumber: prod.invoiceNumber,
        studentNumber: prod.studentNumber,
        reason: 'Missing in copy DB',
      });
      continue;
    }

    const prodHasVacation = hasVacationFee(prod.feeNames);
    const copyHasVacation = hasVacationFee(copy.feeNames);

    const sameFeeShape =
      prod.feeIds.length === copy.feeIds.length &&
      prod.feeIds.every((id, i) => id === copy.feeIds[i]);

    if (!prodHasVacation) {
      skipped.push({
        invoiceNumber: prod.invoiceNumber,
        studentNumber: prod.studentNumber,
        reason: 'Prod does not contain vacation fees',
      });
      continue;
    }

    if (copyHasVacation) {
      skipped.push({
        invoiceNumber: prod.invoiceNumber,
        studentNumber: prod.studentNumber,
        reason: 'Copy also has vacation fees (wrong restore timestamp?)',
      });
      continue;
    }

    if (sameFeeShape) {
      skipped.push({
        invoiceNumber: prod.invoiceNumber,
        studentNumber: prod.studentNumber,
        reason: 'No fee differences between prod and copy',
      });
      continue;
    }

    if (!copy.feeIds.length) {
      skipped.push({
        invoiceNumber: prod.invoiceNumber,
        studentNumber: prod.studentNumber,
        reason: 'Copy invoice has no fees, skipped',
      });
      continue;
    }

    plan.push({
      invoiceNumber: prod.invoiceNumber,
      studentNumber: prod.studentNumber,
      className: prod.className,
      prodInvoiceId: prod.invoiceId,
      prodStudentId: prod.studentId,
      prodEnrolId: prod.enrolId,
      fromFeeNames: prod.feeNames,
      toFeeNames: copy.feeNames,
      toFeeIds: copy.feeIds,
      copyTotalBill: copy.totalBill,
      copyExemptedAmount: copy.exemptedAmount,
    });
  }

  return { plan, skipped };
}

async function applyPlan(prodClient, plan) {
  await prodClient.query('BEGIN');
  try {
    for (const item of plan) {
      await prodClient.query(
        `DELETE FROM bills WHERE "invoiceId" = $1`,
        [item.prodInvoiceId],
      );

      for (const feeId of item.toFeeIds) {
        await prodClient.query(
          `
          INSERT INTO bills ("studentId", "feesId", "enrolId", "invoiceId")
          VALUES ($1, $2, $3, $4)
          `,
          [item.prodStudentId, feeId, item.prodEnrolId, item.prodInvoiceId],
        );
      }

      await prodClient.query(
        `
        UPDATE invoice
        SET "totalBill" = $1,
            "exemptedAmount" = $2
        WHERE id = $3
        `,
        [item.copyTotalBill, item.copyExemptedAmount, item.prodInvoiceId],
      );
    }

    await prodClient.query('COMMIT');
  } catch (error) {
    await prodClient.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const prodUrl = requireEnv('PROD_DATABASE_URL');
  const copyUrl = requireEnv('COPY_DATABASE_URL');
  const termNum = parseIntEnv('TERM_NUM');
  const termYear = parseIntEnv('TERM_YEAR');
  const apply = String(process.env.APPLY || '').toLowerCase() === 'true';
  const className = process.env.CLASS_NAME?.trim();
  const studentNumber = process.env.STUDENT_NUMBER?.trim();

  const prodClient = new Client({ connectionString: prodUrl });
  const copyClient = new Client({ connectionString: copyUrl });

  try {
    await prodClient.connect();
    await copyClient.connect();

    const scope = { termNum, termYear, className, studentNumber };
    const [prodInvoices, copyInvoices] = await Promise.all([
      loadInvoices(prodClient, scope),
      loadInvoices(copyClient, scope),
    ]);

    const { plan, skipped } = buildRecoveryPlan(prodInvoices, copyInvoices);

    console.log('--- Recovery scope ---');
    console.log(JSON.stringify(scope, null, 2));
    console.log(`Prod invoices scanned: ${prodInvoices.length}`);
    console.log(`Copy invoices scanned: ${copyInvoices.length}`);
    console.log(`Candidates to recover: ${plan.length}`);
    console.log(`Skipped: ${skipped.length}`);

    if (plan.length) {
      console.log('\n--- Planned recoveries ---');
      for (const item of plan) {
        console.log(
          `${item.invoiceNumber} | ${item.studentNumber} | ${item.className}\n` +
            `  from: ${item.fromFeeNames.join(', ')}\n` +
            `  to:   ${item.toFeeNames.join(', ')}\n` +
            `  totalBill -> ${item.copyTotalBill}; exemptedAmount -> ${item.copyExemptedAmount}`,
        );
      }
    }

    if (skipped.length) {
      console.log('\n--- Skipped ---');
      for (const item of skipped) {
        console.log(`${item.invoiceNumber} | ${item.studentNumber} | ${item.reason}`);
      }
    }

    if (!apply) {
      console.log('\nDRY RUN ONLY. No changes were written.');
      console.log('To apply, rerun with APPLY=true.');
      return;
    }

    if (!plan.length) {
      console.log('\nNothing to apply.');
      return;
    }

    await applyPlan(prodClient, plan);
    console.log('\nAPPLY COMPLETE: recovery updates committed.');
    console.log(
      'Next: run class/student reconciliation in the app API to refresh balances/statuses.',
    );
  } finally {
    await Promise.allSettled([prodClient.end(), copyClient.end()]);
  }
}

main().catch((error) => {
  console.error('\nRecovery script failed:');
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

