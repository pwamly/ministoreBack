"use strict";

// =====================================================
// EXPENSES
// =====================================================
//
// GET    /expense-categories
// POST   /expense-categories
// PUT    /expense-categories/:id
// GET    /expenses                  list + totals (by category / method)
// POST   /expenses
// PUT    /expenses/:id
// DELETE /expenses/:id
// GET    /reports/profit-loss       sales profit minus expenses

import { Router } from "express";
import { Op, QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can, has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { PAYMENT_METHODS } from "../../config/defaults.js";
import {
    handler,
    badRequest,
    notFound,
    cleanString,
    isProvided,
    isDateString,
    requireNumber,
    round2,
    pagination,
    paginationMeta,
} from "../../utils/http.js";

const { sequelize, expense, expenseCategory, min_user } = db;

const router = Router();

const VIEW = can(PERMISSIONS.EXPENSES_VIEW);
const CREATE = can(PERMISSIONS.EXPENSES_CREATE);
const MANAGE = can(PERMISSIONS.EXPENSES_MANAGE);

// Cashiers (no expenses.view_all) only see what they recorded.
const visibleTo = (req) => ({
    tenantId: req.tenantId,
    ...(has(req, PERMISSIONS.EXPENSES_VIEW_ALL) ? {} : { userId: req.user.id }),
});

// Server-local date, same convention as the sales date filters.
const today = () => {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// =====================================================
// CATEGORIES
// =====================================================

router.get(
    "/expense-categories",
    VIEW,
    handler(async (req, res) => {
        const where = { tenantId: req.tenantId };

        if (isProvided(req.query.status)) {
            where.status = req.query.status;
        }

        const rows = await expenseCategory.findAll({ where, order: [["name", "ASC"]] });

        return res.json({ successful: true, data: rows });
    })
);

router.post(
    "/expense-categories",
    MANAGE,
    handler(async (req, res) => {
        const name = cleanString(req.body.name);

        if (!name) {
            throw badRequest("Category name is required");
        }

        const created = await expenseCategory.create({
            tenantId: req.tenantId,
            name,
            description: cleanString(req.body.description),
        });

        return res.status(201).json({ successful: true, message: "Category added", data: created });
    })
);

router.put(
    "/expense-categories/:id",
    MANAGE,
    handler(async (req, res) => {
        const found = await expenseCategory.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });

        if (!found) {
            throw notFound("Category not found");
        }

        const changes = {};

        if (req.body.name !== undefined) {
            changes.name = cleanString(req.body.name);

            if (!changes.name) {
                throw badRequest("Category name cannot be empty");
            }
        }

        if (req.body.description !== undefined) {
            changes.description = cleanString(req.body.description);
        }

        if (req.body.status !== undefined) {
            if (!["active", "inactive"].includes(req.body.status)) {
                throw badRequest("status must be active or inactive");
            }

            changes.status = req.body.status;
        }

        await found.update(changes);

        return res.json({ successful: true, message: "Category updated", data: found });
    })
);

// =====================================================
// EXPENSES
// =====================================================

/** Validated expense fields from the body. `partial` for updates. */
const readExpense = async (req, partial = false) => {
    const body = req.body;
    const data = {};

    if (!partial || body.amount !== undefined) {
        data.amount = round2(requireNumber(body.amount, "Amount", { gt: 0 }));
    }

    if (!partial || body.categoryId !== undefined) {
        const category = await expenseCategory.findOne({
            where: { id: body.categoryId || null, tenantId: req.tenantId },
        });

        if (!category) {
            throw badRequest("Choose a valid expense category");
        }

        data.categoryId = category.id;
    }

    if (!partial || body.expenseDate !== undefined) {
        const date = body.expenseDate || today();

        if (!isDateString(date)) {
            throw badRequest("Expense date must be YYYY-MM-DD");
        }

        if (date > today()) {
            throw badRequest("Expense date cannot be in the future");
        }

        data.expenseDate = date;
    }

    if (!partial || body.paymentMethod !== undefined) {
        const method = String(body.paymentMethod || "cash").toLowerCase();

        if (!PAYMENT_METHODS.includes(method)) {
            throw badRequest(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`);
        }

        data.paymentMethod = method;
    }

    for (const field of ["payee", "reference", "description"]) {
        if (body[field] !== undefined) {
            data[field] = cleanString(body[field]);
        }
    }

    return data;
};

const formatExpense = (row) => ({
    id: row.id,
    amount: Number(row.amount),
    expenseDate: row.expenseDate,
    paymentMethod: row.paymentMethod,
    payee: row.payee,
    reference: row.reference,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.category?.name || null,
    recordedBy: row.user ? `${row.user.first_name} ${row.user.last_name}`.trim() : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

const dateRange = (startDate, endDate) => {
    if (!isDateString(startDate) && !isDateString(endDate)) {
        return null;
    }

    return {
        ...(isDateString(startDate) ? { [Op.gte]: startDate } : {}),
        ...(isDateString(endDate) ? { [Op.lte]: endDate } : {}),
    };
};

router.get(
    "/expenses",
    VIEW,
    handler(async (req, res) => {
        const { startDate, endDate, categoryId, paymentMethod, search } = req.query;
        const page = pagination(req.query, { defaultLimit: 25 });

        const where = visibleTo(req);
        const range = dateRange(startDate, endDate);

        if (range) {
            where.expenseDate = range;
        }

        if (isProvided(categoryId)) {
            where.categoryId = categoryId;
        }

        if (isProvided(paymentMethod)) {
            where.paymentMethod = paymentMethod;
        }

        if (isProvided(search)) {
            const term = `%${String(search).trim()}%`;

            where[Op.or] = [
                { payee: { [Op.like]: term } },
                { reference: { [Op.like]: term } },
                { description: { [Op.like]: term } },
            ];
        }

        const { rows, count } = await expense.findAndCountAll({
            where,
            include: [
                { model: expenseCategory, as: "category", attributes: ["id", "name"] },
                { model: min_user, as: "user", attributes: ["id", "first_name", "last_name"], required: false },
            ],
            order: [
                ["expenseDate", "DESC"],
                ["createdAt", "DESC"],
            ],
            limit: page.limit,
            offset: page.offset,
        });

        // Totals for the whole filtered range, not just this page.
        const [byCategory, byMethod] = await Promise.all([
            expense.findAll({
                where,
                attributes: ["categoryId", [sequelize.fn("SUM", sequelize.col("amount")), "total"], [sequelize.fn("COUNT", sequelize.col("expense.id")), "count"]],
                include: [{ model: expenseCategory, as: "category", attributes: ["name"] }],
                group: ["categoryId", "category.id"],
                raw: true,
                nest: true,
            }),
            expense.findAll({
                where,
                attributes: ["paymentMethod", [sequelize.fn("SUM", sequelize.col("amount")), "total"]],
                group: ["paymentMethod"],
                raw: true,
            }),
        ]);

        const total = byCategory.reduce((sum, row) => sum + Number(row.total), 0);

        return res.json({
            successful: true,
            data: rows.map(formatExpense),
            pagination: paginationMeta(page, count),
            summary: {
                total: round2(total),
                count,
                byCategory: byCategory
                    .map((row) => ({
                        categoryId: row.categoryId,
                        name: row.category?.name,
                        total: round2(row.total),
                        count: Number(row.count),
                    }))
                    .sort((a, b) => b.total - a.total),
                byPaymentMethod: byMethod.map((row) => ({
                    paymentMethod: row.paymentMethod,
                    total: round2(row.total),
                })),
            },
        });
    })
);

router.post(
    "/expenses",
    CREATE,
    handler(async (req, res) => {
        const data = await readExpense(req);

        const created = await expense.create({ ...data, tenantId: req.tenantId, userId: req.user.id });
        const full = await expense.findByPk(created.id, {
            include: [{ model: expenseCategory, as: "category", attributes: ["id", "name"] }],
        });

        return res.status(201).json({ successful: true, message: "Expense recorded", data: formatExpense(full) });
    })
);

const findExpense = async (req) => {
    const found = await expense.findOne({
        where: { id: req.params.id, tenantId: req.tenantId },
        include: [{ model: expenseCategory, as: "category", attributes: ["id", "name"] }],
    });

    if (!found) {
        throw notFound("Expense not found");
    }

    return found;
};

router.put(
    "/expenses/:id",
    MANAGE,
    handler(async (req, res) => {
        const found = await findExpense(req);
        const data = await readExpense(req, true);

        await found.update(data);
        await found.reload({ include: [{ model: expenseCategory, as: "category", attributes: ["id", "name"] }] });

        return res.json({ successful: true, message: "Expense updated", data: formatExpense(found) });
    })
);

router.delete(
    "/expenses/:id",
    MANAGE,
    handler(async (req, res) => {
        const found = await findExpense(req);

        await found.destroy();

        return res.json({ successful: true, message: "Expense deleted" });
    })
);

// =====================================================
// PROFIT & LOSS
// =====================================================
//
// Revenue and gross profit come from completed sales in the
// period (by sale date), expenses by expense date.

router.get(
    "/reports/profit-loss",
    can(PERMISSIONS.EXPENSES_VIEW, PERMISSIONS.SALES_VIEW_PROFIT),
    handler(async (req, res) => {
        const startDate = isDateString(req.query.startDate) ? req.query.startDate : today().slice(0, 8) + "01";
        const endDate = isDateString(req.query.endDate) ? req.query.endDate : today();

        const [salesRow] = await sequelize.query(
            `SELECT
                COUNT(DISTINCT s.id) AS transactions,
                COALESCE(SUM(si.subtotal), 0) AS revenue,
                COALESCE(SUM(si.costPrice * si.quantity), 0) AS costOfGoods,
                COALESCE(SUM(si.profit), 0) AS grossProfit
            FROM sales s
            JOIN salesItems si ON si.saleId = s.id
            WHERE s.tenantId = :tenantId
              AND s.status = 'completed'
              AND s.createdAt >= :start AND s.createdAt <= :end`,
            {
                replacements: {
                    tenantId: req.tenantId,
                    start: new Date(`${startDate}T00:00:00`),
                    end: new Date(`${endDate}T23:59:59.999`),
                },
                type: QueryTypes.SELECT,
            }
        );

        const expenseTotal = await expense.sum("amount", {
            where: { tenantId: req.tenantId, expenseDate: { [Op.between]: [startDate, endDate] } },
        });

        const grossProfit = round2(salesRow.grossProfit);
        const expenses = round2(expenseTotal || 0);

        return res.json({
            successful: true,
            data: {
                startDate,
                endDate,
                transactions: Number(salesRow.transactions),
                revenue: round2(salesRow.revenue),
                costOfGoods: round2(salesRow.costOfGoods),
                grossProfit,
                expenses,
                netProfit: round2(grossProfit - expenses),
            },
        });
    })
);

export default router;
