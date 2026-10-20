"use strict";

// =====================================================
// LOANS (customer credit)
// =====================================================
//
// A loan is a sale with paymentMethod = "loan". Balance is
// total - paidNow; repayments are loanPayments rows.
//
// GET  /loans                 loan sales (status, search) + summary
// GET  /loans/customers       balances grouped per customer
// GET  /loans/:saleId         one loan with items and repayments
// POST /loan-payment          record a repayment   (loanPayment.js)
// GET  /loan-payments         repayment history    (getLoanPayments.js)

import { Router } from "express";
import { Op, QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { handler, notFound, isProvided, round2, pagination, paginationMeta } from "../../utils/http.js";
import loanPayment from "./loanPayment.js";
import getLoanPayments from "./getLoanPayments.js";

const { sequelize, sales, salesItems, loanPayments, min_user } = db;

const router = Router();

const VIEW = can(PERMISSIONS.LOANS_VIEW);

const localToday = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const BALANCE = sequelize.literal("(`sales`.`total` - `sales`.`paidNow`)");

const loanStatus = (sale, today) => {
    const balance = round2(Number(sale.total) - Number(sale.paidNow));

    if (balance <= 0) {
        return "paid";
    }

    if (sale.loanDueDate && sale.loanDueDate < today) {
        return "overdue";
    }

    return Number(sale.paidNow) > 0 ? "partial" : "unpaid";
};

const formatLoan = (sale, today) => ({
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    customerName: sale.customerName,
    customerMobile: sale.customerMobile,
    total: Number(sale.total),
    paid: Number(sale.paidNow),
    balance: round2(Math.max(Number(sale.total) - Number(sale.paidNow), 0)),
    loanDueDate: sale.loanDueDate,
    status: loanStatus(sale, today),
    soldBy: sale.user ? `${sale.user.first_name} ${sale.user.last_name}`.trim() : null,
    createdAt: sale.createdAt,
});

// =====================================================
// LIST
// =====================================================

router.get(
    "/loans",
    VIEW,
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const today = localToday();
        const { status = "open", search } = req.query;
        const page = pagination(req.query, { defaultLimit: 25 });

        const and = [];

        if (status === "open") {
            and.push(sequelize.where(BALANCE, Op.gt, 0));
        } else if (status === "paid") {
            and.push(sequelize.where(BALANCE, Op.lte, 0));
        } else if (status === "overdue") {
            and.push(sequelize.where(BALANCE, Op.gt, 0));
            and.push({ loanDueDate: { [Op.lt]: today } });
        }

        if (isProvided(search)) {
            const term = `%${String(search).trim()}%`;

            and.push({
                [Op.or]: [
                    { customerName: { [Op.like]: term } },
                    { customerMobile: { [Op.like]: term } },
                    { invoiceNumber: { [Op.like]: term } },
                ],
            });
        }

        const { rows, count } = await sales.findAndCountAll({
            where: { tenantId, paymentMethod: "loan", [Op.and]: and },
            include: [{ model: min_user, as: "user", attributes: ["first_name", "last_name"], required: false }],
            order: [
                [sequelize.literal("`sales`.`loanDueDate` IS NULL"), "ASC"],
                ["loanDueDate", "ASC"],
                ["createdAt", "DESC"],
            ],
            limit: page.limit,
            offset: page.offset,
        });

        const [summary] = await sequelize.query(
            `SELECT
                COUNT(*) AS loans,
                COALESCE(SUM(total), 0) AS lent,
                COALESCE(SUM(paidNow), 0) AS collected,
                COALESCE(SUM(GREATEST(total - paidNow, 0)), 0) AS outstanding,
                COALESCE(SUM(CASE WHEN total - paidNow > 0 THEN 1 ELSE 0 END), 0) AS openLoans,
                COALESCE(SUM(CASE WHEN total - paidNow > 0 AND loanDueDate < :today THEN 1 ELSE 0 END), 0) AS overdueLoans,
                COALESCE(SUM(CASE WHEN total - paidNow > 0 AND loanDueDate < :today THEN total - paidNow ELSE 0 END), 0) AS overdueAmount
            FROM sales
            WHERE tenantId = :tenantId AND paymentMethod = 'loan'`,
            { replacements: { tenantId, today }, type: QueryTypes.SELECT }
        );

        return res.json({
            successful: true,
            data: rows.map((sale) => formatLoan(sale, today)),
            pagination: paginationMeta(page, count),
            summary: {
                loans: Number(summary.loans),
                lent: round2(summary.lent),
                collected: round2(summary.collected),
                outstanding: round2(summary.outstanding),
                openLoans: Number(summary.openLoans),
                overdueLoans: Number(summary.overdueLoans),
                overdueAmount: round2(summary.overdueAmount),
            },
        });
    })
);

// =====================================================
// PER CUSTOMER
// =====================================================
//
// Customers have no table yet, so they are identified by
// mobile number, falling back to name.

router.get(
    "/loans/customers",
    VIEW,
    handler(async (req, res) => {
        const today = localToday();
        const search = isProvided(req.query.search) ? `%${String(req.query.search).trim()}%` : null;
        const onlyOpen = req.query.status !== "all";

        const rows = await sequelize.query(
            `SELECT
                COALESCE(NULLIF(customerMobile, ''), customerName) AS customerKey,
                MAX(customerName) AS customerName,
                MAX(customerMobile) AS customerMobile,
                COUNT(*) AS loans,
                COALESCE(SUM(total), 0) AS lent,
                COALESCE(SUM(paidNow), 0) AS paid,
                COALESCE(SUM(GREATEST(total - paidNow, 0)), 0) AS balance,
                SUM(CASE WHEN total - paidNow > 0 AND loanDueDate < :today THEN 1 ELSE 0 END) AS overdueLoans,
                MIN(CASE WHEN total - paidNow > 0 THEN loanDueDate END) AS nextDueDate,
                MAX(createdAt) AS lastLoanAt
            FROM sales
            WHERE tenantId = :tenantId
              AND paymentMethod = 'loan'
              ${search ? "AND (customerName LIKE :search OR customerMobile LIKE :search)" : ""}
            GROUP BY customerKey
            ${onlyOpen ? "HAVING balance > 0" : ""}
            ORDER BY balance DESC
            LIMIT 500`,
            { replacements: { tenantId: req.tenantId, today, search }, type: QueryTypes.SELECT }
        );

        return res.json({
            successful: true,
            data: rows.map((row) => ({
                customerKey: row.customerKey,
                customerName: row.customerName,
                customerMobile: row.customerMobile,
                loans: Number(row.loans),
                lent: round2(row.lent),
                paid: round2(row.paid),
                balance: round2(row.balance),
                overdueLoans: Number(row.overdueLoans || 0),
                nextDueDate: row.nextDueDate,
                lastLoanAt: row.lastLoanAt,
            })),
        });
    })
);

// =====================================================
// ONE LOAN
// =====================================================

router.get(
    "/loans/:saleId",
    VIEW,
    handler(async (req, res) => {
        const sale = await sales.findOne({
            where: { id: req.params.saleId, tenantId: req.tenantId, paymentMethod: "loan" },
            include: [
                { model: min_user, as: "user", attributes: ["first_name", "last_name"], required: false },
                {
                    model: salesItems,
                    as: "items",
                    attributes: ["productName", "sku", "quantity", "unitPrice", "subtotal"],
                },
                {
                    model: loanPayments,
                    as: "loanPayments",
                    include: [{ model: min_user, as: "user", attributes: ["first_name", "last_name"], required: false }],
                },
            ],
            order: [[{ model: loanPayments, as: "loanPayments" }, "paidAt", "ASC"]],
        });

        if (!sale) {
            throw notFound("Loan not found");
        }

        const today = localToday();

        return res.json({
            successful: true,
            data: {
                ...formatLoan(sale, today),
                // Amount paid at checkout = total paid minus repayments.
                paidAtSale: round2(
                    Number(sale.paidNow) - sale.loanPayments.reduce((sum, p) => sum + Number(p.amount), 0)
                ),
                items: sale.items.map((item) => ({
                    productName: item.productName,
                    sku: item.sku,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    subtotal: Number(item.subtotal),
                })),
                payments: sale.loanPayments.map((payment) => ({
                    id: payment.id,
                    amount: Number(payment.amount),
                    paymentMethod: payment.paymentMethod,
                    note: payment.note,
                    paidAt: payment.paidAt,
                    receivedBy: payment.user
                        ? `${payment.user.first_name} ${payment.user.last_name}`.trim()
                        : null,
                })),
            },
        });
    })
);

// =====================================================
// REPAYMENTS
// =====================================================

router.post("/loan-payment", can(PERMISSIONS.LOANS_COLLECT), loanPayment);
router.get("/loan-payments", VIEW, getLoanPayments);

export default router;
