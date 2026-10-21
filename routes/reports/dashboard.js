"use strict";

// =====================================================
// DASHBOARD DATA
// =====================================================
//
// GET /dashboard?days=7|30|90
//
// Everything the dashboard charts need in one call. Figures the
// user may not see (profit, expenses, loans, stock) are left out
// according to their permissions and the store's plan.

import { Router } from "express";
import { QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can, has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { handler, round2 } from "../../utils/http.js";

const { sequelize } = db;

const router = Router();

const pad = (value) => String(value).padStart(2, "0");
const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Sales are stored in UTC; group them by the server's local day,
// the same convention as the date filters elsewhere.
const offsetMinutes = () => -new Date().getTimezoneOffset();

const query = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

router.get(
    "/dashboard",
    can(PERMISSIONS.SALES_VIEW_ALL),
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
        const showProfit = has(req, PERMISSIONS.SALES_VIEW_PROFIT);
        const offset = offsetMinutes();

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const periodStart = new Date(todayStart);
        periodStart.setDate(periodStart.getDate() - (days - 1));
        const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const base = { tenantId, offset, periodStart, todayStart };

        // ---------------- totals ----------------

        const totalsSql = (from) => `
            SELECT COUNT(DISTINCT s.id) AS transactions,
                   COALESCE(SUM(si.subtotal), 0) AS revenue,
                   COALESCE(SUM(si.profit), 0) AS profit,
                   COALESCE(SUM(si.quantity), 0) AS items
              FROM sales s
              JOIN salesItems si ON si.saleId = s.id
             WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :${from}`;

        const [[today], [period]] = await Promise.all([query(totalsSql("todayStart"), base), query(totalsSql("periodStart"), base)]);

        // ---------------- sales per day ----------------

        const dailyRows = await query(
            `SELECT DATE_FORMAT(DATE_ADD(s.createdAt, INTERVAL :offset MINUTE), '%Y-%m-%d') AS day,
                    COUNT(DISTINCT s.id) AS transactions,
                    COALESCE(SUM(si.subtotal), 0) AS revenue,
                    COALESCE(SUM(si.profit), 0) AS profit
               FROM sales s
               JOIN salesItems si ON si.saleId = s.id
              WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :periodStart
              GROUP BY day`,
            base
        );

        const byDay = Object.fromEntries(dailyRows.map((row) => [row.day, row]));
        const salesByDay = [];

        for (let i = 0; i < days; i += 1) {
            const date = new Date(periodStart);
            date.setDate(date.getDate() + i);

            const row = byDay[ymd(date)];

            salesByDay.push({
                date: ymd(date),
                revenue: round2(row?.revenue || 0),
                transactions: Number(row?.transactions || 0),
                ...(showProfit ? { profit: round2(row?.profit || 0) } : {}),
            });
        }

        // ---------------- top products ----------------

        const topProducts = (
            await query(
                `SELECT COALESCE(si.productId, CONCAT('manual:', si.productName)) AS id,
                        MAX(si.productName) AS name,
                        SUM(si.quantity) AS quantity,
                        SUM(si.subtotal) AS revenue,
                        SUM(si.profit) AS profit
                   FROM sales s
                   JOIN salesItems si ON si.saleId = s.id
                  WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :periodStart
                  GROUP BY id
                  ORDER BY revenue DESC
                  LIMIT 10`,
                base
            )
        ).map((row) => ({
            name: row.name,
            quantity: Number(row.quantity),
            revenue: round2(row.revenue),
            ...(showProfit ? { profit: round2(row.profit) } : {}),
        }));

        // ---------------- payment methods ----------------

        const paymentMethods = (
            await query(
                `SELECT paymentMethod AS method, COUNT(*) AS transactions, SUM(total) AS total
                   FROM sales
                  WHERE tenantId = :tenantId AND status = 'completed' AND createdAt >= :periodStart
                  GROUP BY paymentMethod
                  ORDER BY total DESC`,
                base
            )
        ).map((row) => ({ method: row.method, transactions: Number(row.transactions), total: round2(row.total) }));

        // ---------------- last 6 months ----------------

        const monthKeys = [];

        for (let i = 0; i < 6; i += 1) {
            const date = new Date(sixMonthsStart.getFullYear(), sixMonthsStart.getMonth() + i, 1);
            monthKeys.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}`);
        }

        const monthlySales = await query(
            `SELECT DATE_FORMAT(DATE_ADD(s.createdAt, INTERVAL :offset MINUTE), '%Y-%m') AS month,
                    SUM(si.subtotal) AS revenue,
                    SUM(si.profit) AS profit
               FROM sales s
               JOIN salesItems si ON si.saleId = s.id
              WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :sixMonthsStart
              GROUP BY month`,
            { ...base, sixMonthsStart }
        );

        const showExpenses = has(req, PERMISSIONS.EXPENSES_VIEW_ALL);

        const monthlyExpenses = showExpenses
            ? await query(
                  `SELECT DATE_FORMAT(expenseDate, '%Y-%m') AS month, SUM(amount) AS expenses
                     FROM expenses
                    WHERE tenantId = :tenantId AND expenseDate >= :start
                    GROUP BY month`,
                  { tenantId, start: ymd(sixMonthsStart) }
              )
            : [];

        const salesByMonth = Object.fromEntries(monthlySales.map((row) => [row.month, row]));
        const expensesByMonth = Object.fromEntries(monthlyExpenses.map((row) => [row.month, row]));

        const monthly = monthKeys.map((month) => ({
            month,
            revenue: round2(salesByMonth[month]?.revenue || 0),
            ...(showProfit ? { profit: round2(salesByMonth[month]?.profit || 0) } : {}),
            ...(showExpenses ? { expenses: round2(expensesByMonth[month]?.expenses || 0) } : {}),
        }));

        // ---------------- expenses in the period ----------------

        let expenses = null;

        if (showExpenses) {
            const rows = await query(
                `SELECT c.name, SUM(e.amount) AS total
                   FROM expenses e
                   JOIN expenseCategories c ON c.id = e.categoryId
                  WHERE e.tenantId = :tenantId AND e.expenseDate >= :start
                  GROUP BY c.id, c.name
                  ORDER BY total DESC`,
                { tenantId, start: ymd(periodStart) }
            );

            expenses = {
                total: round2(rows.reduce((sum, row) => sum + Number(row.total), 0)),
                byCategory: rows.map((row) => ({ name: row.name, total: round2(row.total) })),
            };
        }

        // ---------------- loans & stock ----------------

        let loans = null;

        if (has(req, PERMISSIONS.LOANS_VIEW)) {
            const [row] = await query(
                `SELECT COALESCE(SUM(GREATEST(total - paidNow, 0)), 0) AS outstanding,
                        COALESCE(SUM(CASE WHEN total - paidNow > 0 THEN 1 ELSE 0 END), 0) AS open
                   FROM sales WHERE tenantId = :tenantId AND paymentMethod = 'loan'`,
                { tenantId }
            );

            loans = { outstanding: round2(row.outstanding), open: Number(row.open) };
        }

        let stock = null;

        if (has(req, PERMISSIONS.INVENTORY_VIEW)) {
            const [row] = await query(
                `SELECT COALESCE(SUM(GREATEST(i.quantity, 0) * COALESCE(d.costPrice, 0)), 0) AS value,
                        -- Out/low only for products whose stock is being counted
                        -- (same rule as the notification bell).
                        COALESCE(SUM(CASE WHEN tracked.productId IS NOT NULL AND i.quantity <= 0 THEN 1 ELSE 0 END), 0) AS outOfStock,
                        COALESCE(SUM(CASE WHEN tracked.productId IS NOT NULL AND i.quantity > 0 AND i.quantity <= i.reorderLevel THEN 1 ELSE 0 END), 0) AS lowStock
                   FROM products p
                   LEFT JOIN inventory i ON i.productId = p.id
                   LEFT JOIN productdetails d ON d.productId = p.id
                   LEFT JOIN (SELECT DISTINCT productId FROM stockMovements WHERE tenantId = :tenantId) tracked
                          ON tracked.productId = p.id
                  WHERE p.tenantId = :tenantId AND p.status = 'active'`,
                { tenantId }
            );

            stock = { value: round2(row.value), outOfStock: Number(row.outOfStock), lowStock: Number(row.lowStock) };
        }

        const summary = (row) => ({
            revenue: round2(row.revenue),
            transactions: Number(row.transactions),
            items: Number(row.items),
            averageSale: row.transactions ? round2(row.revenue / row.transactions) : 0,
            ...(showProfit ? { profit: round2(row.profit) } : {}),
        });

        const periodSummary = summary(period);

        if (showProfit && expenses) {
            periodSummary.netProfit = round2(periodSummary.profit - expenses.total);
        }

        return res.json({
            successful: true,
            data: {
                days,
                today: summary(today),
                period: periodSummary,
                salesByDay,
                topProducts,
                paymentMethods,
                monthly,
                expenses,
                loans,
                stock,
            },
        });
    })
);

export default router;
