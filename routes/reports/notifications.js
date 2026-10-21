"use strict";

// =====================================================
// NOTIFICATIONS (header bell)
// =====================================================
//
// GET /notifications
//
// Computed on request from the store's current data, so they are
// always up to date and need no background job. Each user only gets
// the alerts their permissions allow.
//
// Each item: { id, severity, title, message, link, count }
//   severity: critical | warning | info | success
//   id is stable while the situation is unchanged, so the frontend
//   can remember which ones were already read.

import { Router } from "express";
import { QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS as P } from "../../config/permissions.js";
import { subscriptionState } from "../../services/subscription.js";
import { handler, round2 } from "../../utils/http.js";

const { sequelize } = db;

const router = Router();

const query = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

const DAY_MS = 24 * 60 * 60 * 1000;

const names = (rows, max = 3) => {
    const list = rows.slice(0, max).map((row) => row.name);
    const more = rows.length - list.length;

    return more > 0 ? `${list.join(", ")} and ${more} more` : list.join(", ");
};

const pad = (value) => String(value).padStart(2, "0");
const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

router.get(
    "/notifications",
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const items = [];

        // ---------------- prices: loss / zero / no cost ----------------

        if (has(req, P.PRODUCTS_VIEW_COST)) {
            const rows = await query(
                `SELECT p.itemName AS name,
                        CASE
                          WHEN d.costPrice IS NULL OR d.costPrice = 0 THEN 'noCost'
                          WHEN d.sellingPrice < d.costPrice THEN 'loss'
                          WHEN d.sellingPrice = d.costPrice THEN 'zero'
                        END AS kind
                   FROM products p
                   JOIN productdetails d ON d.productId = p.id
                  WHERE p.tenantId = :tenantId AND p.status = 'active'
                    AND (d.costPrice IS NULL OR d.costPrice = 0 OR d.sellingPrice <= d.costPrice)
                  ORDER BY p.itemName`,
                { tenantId }
            );

            const loss = rows.filter((row) => row.kind === "loss");
            const zero = rows.filter((row) => row.kind === "zero");
            const noCost = rows.filter((row) => row.kind === "noCost");

            if (loss.length) {
                items.push({
                    id: `loss:${loss.length}:${loss[0].name}`,
                    severity: "critical",
                    title: `${loss.length} product${loss.length === 1 ? " sells" : "s sell"} at a loss`,
                    message: `Selling price is below cost: ${names(loss)}.`,
                    link: "/products?margin=loss",
                    count: loss.length,
                });
            }

            if (zero.length) {
                items.push({
                    id: `zero:${zero.length}:${zero[0].name}`,
                    severity: "warning",
                    title: `${zero.length} product${zero.length === 1 ? " makes" : "s make"} no profit`,
                    message: `Selling price equals cost: ${names(zero)}.`,
                    link: "/products?margin=zero",
                    count: zero.length,
                });
            }

            if (noCost.length) {
                items.push({
                    id: `nocost:${noCost.length}`,
                    severity: "info",
                    title: `${noCost.length} product${noCost.length === 1 ? " has" : "s have"} no cost price`,
                    message: `Profit can't be calculated until a cost is entered: ${names(noCost)}.`,
                    link: "/products?margin=noCost",
                    count: noCost.length,
                });
            }
        }

        // ---------------- stock ----------------

        if (has(req, P.INVENTORY_VIEW)) {
            const rows = await query(
                `SELECT p.itemName AS name,
                        CASE WHEN i.quantity <= 0 THEN 'out' ELSE 'low' END AS kind
                   FROM products p
                   JOIN inventory i ON i.productId = p.id
                  WHERE p.tenantId = :tenantId AND p.status = 'active'
                    AND (i.quantity <= 0 OR i.quantity <= i.reorderLevel)
                    -- only products whose stock is being tracked
                    AND EXISTS (SELECT 1 FROM stockMovements m WHERE m.productId = p.id)
                  ORDER BY i.quantity ASC`,
                { tenantId }
            );

            const out = rows.filter((row) => row.kind === "out");
            const low = rows.filter((row) => row.kind === "low");

            if (out.length) {
                items.push({
                    id: `out:${out.length}:${out[0].name}`,
                    severity: "critical",
                    title: `${out.length} product${out.length === 1 ? " is" : "s are"} out of stock`,
                    message: `${names(out)}.`,
                    link: "/inventory?status=out",
                    count: out.length,
                });
            }

            if (low.length) {
                items.push({
                    id: `low:${low.length}:${low[0].name}`,
                    severity: "warning",
                    title: `${low.length} product${low.length === 1 ? " is" : "s are"} running low`,
                    message: `At or below the reorder level: ${names(low)}.`,
                    link: "/inventory?status=low",
                    count: low.length,
                });
            }
        }

        // ---------------- loans ----------------

        if (has(req, P.LOANS_VIEW)) {
            const [row] = await query(
                `SELECT COUNT(*) AS count, COALESCE(SUM(total - paidNow), 0) AS amount
                   FROM sales
                  WHERE tenantId = :tenantId AND paymentMethod = 'loan'
                    AND total - paidNow > 0 AND loanDueDate < :today`,
                { tenantId, today: ymd(new Date()) }
            );

            if (Number(row.count) > 0) {
                items.push({
                    id: `overdue:${row.count}:${round2(row.amount)}`,
                    severity: "warning",
                    title: `${row.count} loan${Number(row.count) === 1 ? " is" : "s are"} overdue`,
                    message: `${round2(row.amount).toLocaleString()} ${req.tenant?.currency || ""} is past its due date.`,
                    link: "/loans",
                    count: Number(row.count),
                });
            }
        }

        // ---------------- items sold but not registered ----------------

        if (has(req, P.PRODUCTS_MANAGE)) {
            const [row] = await query(
                `SELECT COUNT(*) AS count FROM unregisteredItems WHERE tenantId = :tenantId AND status = 'pending'`,
                { tenantId }
            );

            if (Number(row.count) > 0) {
                items.push({
                    id: `unregistered:${row.count}`,
                    severity: "info",
                    title: `${row.count} sold item${Number(row.count) === 1 ? "" : "s"} to register`,
                    message: "Cashiers sold items that are not in the product list yet.",
                    link: "/unregistered-items",
                    count: Number(row.count),
                });
            }
        }

        // ---------------- best seller this week ----------------

        if (has(req, P.SALES_VIEW_ALL)) {
            const weekStart = new Date(Date.now() - 7 * DAY_MS);

            const [best] = await query(
                `SELECT MAX(si.productName) AS name, SUM(si.quantity) AS quantity, SUM(si.subtotal) AS revenue
                   FROM sales s
                   JOIN salesItems si ON si.saleId = s.id
                  WHERE s.tenantId = :tenantId AND s.status = 'completed' AND s.createdAt >= :weekStart
                  GROUP BY COALESCE(si.productId, si.productName)
                  ORDER BY quantity DESC
                  LIMIT 1`,
                { tenantId, weekStart }
            );

            if (best) {
                items.push({
                    id: `best:${ymd(new Date())}:${best.name}`,
                    severity: "success",
                    title: `Best seller this week: ${best.name}`,
                    message: `${Number(best.quantity).toLocaleString()} sold, ${round2(best.revenue).toLocaleString()} ${req.tenant?.currency || ""} in sales over the last 7 days.`,
                    link: "/dashboard/default",
                    count: 0,
                });
            }
        }

        // ---------------- subscription ----------------

        if (has(req, P.SETTINGS_MANAGE) && req.tenant) {
            const { expiresAt } = subscriptionState(req.tenant);

            if (expiresAt) {
                const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS);

                if (daysLeft <= 7) {
                    const trial = req.tenant.subscriptionStatus === "trial";

                    items.push({
                        id: `subscription:${ymd(new Date(expiresAt))}:${daysLeft}`,
                        severity: daysLeft <= 2 ? "critical" : "warning",
                        title: daysLeft > 0 ? `${trial ? "Free trial" : "Subscription"} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `${trial ? "Free trial" : "Subscription"} has ended`,
                        message: "Renew to keep using the system without interruption.",
                        link: "/settings",
                        count: 0,
                    });
                }
            }
        }

        const ORDER = { critical: 0, warning: 1, info: 2, success: 3 };
        items.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

        return res.json({ successful: true, data: items });
    })
);

export default router;
