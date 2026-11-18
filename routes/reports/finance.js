"use strict";

// =====================================================
// MONEY SUMMARY (owner)
// =====================================================
//
// GET /finance/summary?groupBy=week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
//     totals for the range, one row per week / month / financial year,
//     and current stock value + money owed. Without from/to: the last
//     12 weeks, this financial year, or the last 5 financial years.
//
// GET /finance/history?from&to&type&page&limit
//     each sale payment, loan repayment, expense and stock purchase.
//
// See services/finance.js for what is counted where.

import { Router } from "express";

import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { moneyHistory, moneySummary, parseRange } from "../../services/finance.js";
import { handler, pagination, paginationMeta } from "../../utils/http.js";

const router = Router();

router.use("/finance", can(PERMISSIONS.FINANCE_VIEW));

const startMonthOf = (req) => req.tenant?.financialYearStartMonth || 1;

router.get(
    "/finance/summary",
    handler(async (req, res) => {
        const startMonth = startMonthOf(req);
        const { groupBy, from, to } = parseRange(req.query, startMonth);

        const data = await moneySummary({ tenantId: req.tenantId, groupBy, from, to, startMonth });

        return res.json({ successful: true, data });
    })
);

router.get(
    "/finance/history",
    handler(async (req, res) => {
        const { from, to } = parseRange({ ...req.query, groupBy: "month" }, startMonthOf(req));
        const page = pagination(req.query, { defaultLimit: 25, maxLimit: 100 });

        const { rows, total } = await moneyHistory({
            tenantId: req.tenantId,
            from,
            to,
            type: req.query.type,
            limit: page.limit,
            offset: page.offset,
        });

        return res.json({ successful: true, data: rows, pagination: paginationMeta(page, total) });
    })
);

export default router;
