"use strict";

// =====================================================
// MONEY SUMMARY
// =====================================================
//
// Where the store's money came from and went, per week, month or
// financial year. All figures are rebuilt from the records the store
// already keeps:
//
//   money in   sales (amount paid at the till) + loan repayments
//   money out  expenses + completed supplier orders + stock-in with a cost
//   profit     gross = sale lines' profit; net = gross - expenses
//
// sales.paidNow is cumulative (loan repayments are added to it), so the
// money taken at the till is paidNow minus that sale's repayments.
//
// Channels are cash | mobile | card | bank. The deposit on a loan sale
// has no method of its own and is counted as cash. Stock-in entered
// without an order has no payment method ("unrecorded").
//
// Days follow the server's local time, like the dashboard.

import { QueryTypes } from "sequelize";

import db from "../models/index.js";
import { badRequest, isDateString, round2 } from "../utils/http.js";

const { sequelize } = db;

export const GROUPS = ["week", "month", "year"];
export const CHANNELS = ["cash", "mobile", "card", "bank"];

const MAX_BUCKETS = { week: 106, month: 120, year: 10 };

const pad = (value) => String(value).padStart(2, "0");
export const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseYmd = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
};
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const offsetMinutes = () => -new Date().getTimezoneOffset();

// Per sale: amount paid at the till, after removing later loan repayments.
const SALE_REPAID_JOIN = `
    LEFT JOIN (SELECT saleId, SUM(amount) AS repaid FROM loanPayments WHERE tenantId = :tenantId GROUP BY saleId) r
           ON r.saleId = s.id`;
const TILL_PAID = "GREATEST(s.paidNow - COALESCE(r.repaid, 0), 0)";

const query = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// ---------------- periods ----------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Monday of the date's week. */
const weekStart = (date) => addDays(date, -((date.getDay() + 6) % 7));

/** First day of the financial year containing `date`. */
export const financialYearStart = (date, startMonth = 1) => {
    const year = date.getMonth() + 1 >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
    return new Date(year, startMonth - 1, 1);
};

/** "2026" for a calendar year, "2026/27" when the year starts mid-year. */
export const financialYearLabel = (start, startMonth = 1) =>
    startMonth === 1 ? String(start.getFullYear()) : `${start.getFullYear()}/${String(start.getFullYear() + 1).slice(2)}`;

const bucketStart = (date, groupBy, startMonth) => {
    if (groupBy === "week") return weekStart(date);
    if (groupBy === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
    return financialYearStart(date, startMonth);
};

const nextBucket = (start, groupBy) => {
    if (groupBy === "week") return addDays(start, 7);
    if (groupBy === "month") return new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return new Date(start.getFullYear() + 1, start.getMonth(), 1);
};

const bucketLabel = (start, groupBy, startMonth) => {
    if (groupBy === "week") return `Week of ${pad(start.getDate())} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    if (groupBy === "month") return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    return financialYearLabel(start, startMonth);
};

/** Default range for a grouping: 12 weeks, this financial year, or 5 financial years. */
export const defaultRange = (groupBy, startMonth, today = new Date()) => {
    const fyStart = financialYearStart(today, startMonth);

    if (groupBy === "week") {
        const thisWeek = weekStart(today);
        return { from: addDays(thisWeek, -7 * 11), to: addDays(thisWeek, 6) };
    }

    if (groupBy === "month") {
        return { from: fyStart, to: addDays(new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 1), -1) };
    }

    return {
        from: new Date(fyStart.getFullYear() - 4, fyStart.getMonth(), 1),
        to: addDays(new Date(fyStart.getFullYear() + 1, fyStart.getMonth(), 1), -1),
    };
};

/** Validated { groupBy, from, to } (dates, inclusive) from the query string. */
export const parseRange = (queryString, startMonth) => {
    const groupBy = GROUPS.includes(queryString.groupBy) ? queryString.groupBy : "month";
    const fallback = defaultRange(groupBy, startMonth);

    for (const key of ["from", "to"]) {
        if (queryString[key] !== undefined && queryString[key] !== "" && !isDateString(queryString[key])) {
            throw badRequest(`${key} must be a date (YYYY-MM-DD)`);
        }
    }

    const from = queryString.from ? parseYmd(queryString.from) : fallback.from;
    const to = queryString.to ? parseYmd(queryString.to) : fallback.to;

    if (to < from) {
        throw badRequest("The end date must be on or after the start date");
    }

    return { groupBy, from, to };
};

/** Empty buckets covering [from, to], each clipped to the range. */
const buildBuckets = (groupBy, from, to, startMonth) => {
    const buckets = [];

    for (let start = bucketStart(from, groupBy, startMonth); start <= to; start = nextBucket(start, groupBy)) {
        const end = addDays(nextBucket(start, groupBy), -1);

        buckets.push({
            key: ymd(start),
            label: bucketLabel(start, groupBy, startMonth),
            from: ymd(start < from ? from : start),
            to: ymd(end > to ? to : end),
            totals: emptyTotals(),
        });

        if (buckets.length > MAX_BUCKETS[groupBy]) {
            throw badRequest(`That range is too long to show by ${groupBy}. Pick a shorter range or group by a longer period.`);
        }
    }

    return buckets;
};

// ---------------- totals ----------------

const channels = (extra = []) => Object.fromEntries([...CHANNELS, ...extra].map((key) => [key, 0]));

const emptyTotals = () => ({
    sales: 0,
    costOfSales: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    stockBought: 0,
    creditGiven: 0,
    loanCollected: 0,
    moneyIn: channels(),
    moneyOut: channels(["unrecorded"]),
});

const channelOf = (method, fallback = "cash") => (CHANNELS.includes(method) ? method : fallback);

/** Every money row of the range, by local day. */
const loadDailyRows = async (tenantId, from, to) => {
    // Timestamps are UTC: compare against local midnights.
    const params = { tenantId, offset: offsetMinutes(), start: from, end: addDays(to, 1), startDay: ymd(from), endDay: ymd(to) };
    const day = (column) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL :offset MINUTE), '%Y-%m-%d')`;

    const [lines, sales, loanPayments, expenses, orders, stockIn] = await Promise.all([
        query(
            `SELECT ${day("s.createdAt")} AS day, SUM(si.subtotal) AS sales, SUM(si.profit) AS profit
               FROM sales s JOIN salesItems si ON si.saleId = s.id
              WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :start AND s.createdAt < :end
              GROUP BY day`,
            params
        ),
        query(
            `SELECT ${day("s.createdAt")} AS day, s.paymentMethod AS method,
                    SUM(${TILL_PAID}) AS paid, SUM(GREATEST(s.total - ${TILL_PAID}, 0)) AS credit
               FROM sales s ${SALE_REPAID_JOIN}
              WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :start AND s.createdAt < :end
              GROUP BY day, method`,
            params
        ),
        query(
            `SELECT ${day("paidAt")} AS day, paymentMethod AS method, SUM(amount) AS amount
               FROM loanPayments
              WHERE tenantId = :tenantId AND paidAt >= :start AND paidAt < :end
              GROUP BY day, method`,
            params
        ),
        query(
            `SELECT DATE_FORMAT(expenseDate, '%Y-%m-%d') AS day, paymentMethod AS method, SUM(amount) AS amount
               FROM expenses
              WHERE tenantId = :tenantId AND expenseDate BETWEEN :startDay AND :endDay
              GROUP BY day, method`,
            params
        ),
        query(
            `SELECT ${day("completedAt")} AS day, paymentMethod AS method, SUM(totalAmount) AS amount
               FROM purchaseOrders
              WHERE tenantId = :tenantId AND status = 'completed' AND completedAt >= :start AND completedAt < :end
              GROUP BY day, method`,
            params
        ),
        // Stock received without an order (orders are counted above).
        query(
            `SELECT ${day("createdAt")} AS day, SUM(quantity * unitCost) AS amount
               FROM stockMovements
              WHERE tenantId = :tenantId AND type = 'purchase' AND unitCost IS NOT NULL
                AND (referenceType IS NULL OR referenceType <> 'purchaseOrder')
                AND createdAt >= :start AND createdAt < :end
              GROUP BY day`,
            params
        ),
    ]);

    return { lines, sales, loanPayments, expenses, orders, stockIn };
};

const addRows = (rows, find, apply) => {
    for (const row of rows) {
        const totals = find(row.day);
        if (totals) apply(totals, row);
    }
};

const finish = (totals) => {
    totals.costOfSales = totals.sales - totals.grossProfit;
    totals.netProfit = totals.grossProfit - totals.expenses;

    const moneyIn = Object.values(totals.moneyIn).reduce((sum, value) => sum + value, 0);
    const moneyOut = Object.values(totals.moneyOut).reduce((sum, value) => sum + value, 0);

    const rounded = Object.fromEntries(
        Object.entries(totals).map(([key, value]) =>
            typeof value === "number"
                ? [key, round2(value)]
                : [key, Object.fromEntries(Object.entries(value).map(([channel, amount]) => [channel, round2(amount)]))]
        )
    );

    return {
        ...rounded,
        moneyInTotal: round2(moneyIn),
        moneyOutTotal: round2(moneyOut),
        netCashFlow: round2(moneyIn - moneyOut),
        net: Object.fromEntries(
            [...CHANNELS, "unrecorded"].map((channel) => [
                channel,
                round2((totals.moneyIn[channel] || 0) - (totals.moneyOut[channel] || 0)),
            ])
        ),
    };
};

/** Stock value and money owed right now (not tied to the range). */
const loadSnapshot = async (tenantId) => {
    const [[stock], [loans]] = await Promise.all([
        query(
            `SELECT COALESCE(SUM(GREATEST(i.quantity, 0) * COALESCE(d.costPrice, 0)), 0) AS costValue,
                    COALESCE(SUM(GREATEST(i.quantity, 0) * COALESCE(d.sellingPrice, 0)), 0) AS salesValue
               FROM products p
               JOIN inventory i ON i.productId = p.id
               LEFT JOIN productdetails d ON d.productId = p.id
              WHERE p.tenantId = :tenantId AND p.status = 'active'`,
            { tenantId }
        ),
        query(
            `SELECT COALESCE(SUM(GREATEST(total - paidNow, 0)), 0) AS outstanding,
                    COALESCE(SUM(CASE WHEN total - paidNow > 0 THEN 1 ELSE 0 END), 0) AS open
               FROM sales WHERE tenantId = :tenantId AND paymentMethod = 'loan' AND status = 'completed'`,
            { tenantId }
        ),
    ]);

    return {
        stockValue: round2(stock.costValue),
        stockSalesValue: round2(stock.salesValue),
        loansOutstanding: round2(loans.outstanding),
        openLoans: Number(loans.open),
    };
};

/**
 * @returns {{ groupBy, from, to, financialYearStartMonth, summary, periods, snapshot }}
 */
export const moneySummary = async ({ tenantId, groupBy, from, to, startMonth = 1 }) => {
    const buckets = buildBuckets(groupBy, from, to, startMonth);
    const overall = emptyTotals();

    // Day -> bucket totals, for both the bucket and the overall sum.
    const keyOfDay = (value) => ymd(bucketStart(parseYmd(value), groupBy, startMonth));
    const byKey = Object.fromEntries(buckets.map((bucket) => [bucket.key, bucket.totals]));
    const targets = (value) => {
        const totals = byKey[keyOfDay(value)];
        return totals ? [totals, overall] : [];
    };
    const each = (rows, apply) => addRows(rows, (value) => targets(value), (list, row) => list.forEach((totals) => apply(totals, row)));

    const [rows, snapshot] = await Promise.all([loadDailyRows(tenantId, from, to), loadSnapshot(tenantId)]);

    each(rows.lines, (totals, row) => {
        totals.sales += Number(row.sales);
        totals.grossProfit += Number(row.profit);
    });
    each(rows.sales, (totals, row) => {
        totals.moneyIn[channelOf(row.method)] += Number(row.paid);
        totals.creditGiven += Number(row.credit);
    });
    each(rows.loanPayments, (totals, row) => {
        totals.moneyIn[channelOf(row.method)] += Number(row.amount);
        totals.loanCollected += Number(row.amount);
    });
    each(rows.expenses, (totals, row) => {
        totals.moneyOut[channelOf(row.method)] += Number(row.amount);
        totals.expenses += Number(row.amount);
    });
    each(rows.orders, (totals, row) => {
        totals.moneyOut[channelOf(row.method, "unrecorded")] += Number(row.amount);
        totals.stockBought += Number(row.amount);
    });
    each(rows.stockIn, (totals, row) => {
        totals.moneyOut.unrecorded += Number(row.amount);
        totals.stockBought += Number(row.amount);
    });

    return {
        groupBy,
        from: ymd(from),
        to: ymd(to),
        financialYearStartMonth: startMonth,
        summary: finish(overall),
        periods: buckets.map((bucket) => ({ key: bucket.key, label: bucket.label, from: bucket.from, to: bucket.to, ...finish(bucket.totals) })),
        snapshot,
    };
};

// ---------------- history ----------------

export const HISTORY_TYPES = ["sale", "loan_payment", "expense", "stock_order", "stock_in"];

/**
 * Every money movement in the range, newest first.
 * Rows: { id, type, direction, amount, method, occurredAt (local), reference, description, profit, credit }
 */
export const moneyHistory = async ({ tenantId, from, to, type, limit, offset }) => {
    const params = {
        tenantId,
        offset: offsetMinutes(),
        start: from,
        end: addDays(to, 1),
        startDay: ymd(from),
        endDay: ymd(to),
        limit,
        skip: offset,
    };
    const local = (column) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL :offset MINUTE), '%Y-%m-%d %H:%i')`;

    const parts = {
        sale: `
            SELECT s.id, 'sale' AS type, 'in' AS direction, ${TILL_PAID} AS amount,
                   CASE WHEN s.paymentMethod = 'loan' THEN 'cash' ELSE s.paymentMethod END AS method,
                   ${local("s.createdAt")} AS occurredAt, s.invoiceNumber AS reference,
                   CASE WHEN s.paymentMethod = 'loan' THEN CONCAT('Loan sale', COALESCE(CONCAT(' to ', s.customerName), '')) ELSE 'Sale' END AS description,
                   (SELECT SUM(si.profit) FROM salesItems si WHERE si.saleId = s.id) AS profit,
                   GREATEST(s.total - ${TILL_PAID}, 0) AS credit
              FROM sales s ${SALE_REPAID_JOIN}
             WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :start AND s.createdAt < :end`,
        loan_payment: `
            SELECT lp.id, 'loan_payment' AS type, 'in' AS direction, lp.amount AS amount, lp.paymentMethod AS method,
                   ${local("lp.paidAt")} AS occurredAt, s.invoiceNumber AS reference,
                   CONCAT('Loan repayment', COALESCE(CONCAT(' from ', s.customerName), '')) AS description,
                   NULL AS profit, NULL AS credit
              FROM loanPayments lp LEFT JOIN sales s ON s.id = lp.saleId
             WHERE lp.tenantId = :tenantId AND lp.paidAt >= :start AND lp.paidAt < :end`,
        expense: `
            SELECT e.id, 'expense' AS type, 'out' AS direction, e.amount AS amount, e.paymentMethod AS method,
                   DATE_FORMAT(e.expenseDate, '%Y-%m-%d') AS occurredAt, e.reference AS reference,
                   CONCAT(COALESCE(c.name, 'Expense'), COALESCE(CONCAT(' · ', e.payee), '')) AS description,
                   NULL AS profit, NULL AS credit
              FROM expenses e LEFT JOIN expenseCategories c ON c.id = e.categoryId
             WHERE e.tenantId = :tenantId AND e.expenseDate BETWEEN :startDay AND :endDay`,
        stock_order: `
            SELECT po.id, 'stock_order' AS type, 'out' AS direction, po.totalAmount AS amount,
                   COALESCE(po.paymentMethod, 'unrecorded') AS method,
                   ${local("po.completedAt")} AS occurredAt, CONCAT('PO-', LPAD(po.orderNumber, 4, '0')) AS reference,
                   CONCAT('Stock order', COALESCE(CONCAT(' from ', sp.name), '')) AS description,
                   NULL AS profit, NULL AS credit
              FROM purchaseOrders po LEFT JOIN suppliers sp ON sp.id = po.supplierId
             WHERE po.tenantId = :tenantId AND po.status = 'completed' AND po.completedAt >= :start AND po.completedAt < :end`,
        stock_in: `
            SELECT sm.id, 'stock_in' AS type, 'out' AS direction, sm.quantity * sm.unitCost AS amount, 'unrecorded' AS method,
                   ${local("sm.createdAt")} AS occurredAt, NULL AS reference,
                   CONCAT('Stock in: ', TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM sm.quantity)), ' × ', COALESCE(p.itemName, 'product')) AS description,
                   NULL AS profit, NULL AS credit
              FROM stockMovements sm LEFT JOIN products p ON p.id = sm.productId
             WHERE sm.tenantId = :tenantId AND sm.type = 'purchase' AND sm.unitCost IS NOT NULL
               AND (sm.referenceType IS NULL OR sm.referenceType <> 'purchaseOrder')
               AND sm.createdAt >= :start AND sm.createdAt < :end`,
    };

    if (type !== undefined && type !== "" && !HISTORY_TYPES.includes(type)) {
        throw badRequest(`type must be one of: ${HISTORY_TYPES.join(", ")}`);
    }

    const selected = type ? [type] : HISTORY_TYPES;
    const union = selected.map((key) => parts[key]).join(" UNION ALL ");

    const [rows, [{ total }]] = await Promise.all([
        query(`SELECT * FROM (${union}) money ORDER BY occurredAt DESC, id LIMIT :limit OFFSET :skip`, params),
        query(`SELECT COUNT(*) AS total FROM (${union}) money`, params),
    ]);

    return {
        total: Number(total),
        rows: rows.map((row) => ({
            id: row.id,
            type: row.type,
            direction: row.direction,
            amount: round2(row.amount),
            method: row.method,
            occurredAt: row.occurredAt,
            reference: row.reference,
            description: row.description,
            profit: row.profit === null ? null : round2(row.profit),
            credit: row.credit === null || Number(row.credit) === 0 ? null : round2(row.credit),
        })),
    };
};
