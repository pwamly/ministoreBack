"use strict";

// =====================================================
// MANUAL PAYMENT VERIFICATION (super_admin)
// =====================================================
//
// GET  /platform/payments/summary          revenue (today / month / year / all), waiting, expiring stores
// GET  /platform/payments?status=pending   manual payments to check (status=all for every one)
// GET  /platform/payments/:id/proof        the uploaded screenshot (data URL)
// POST /platform/payments/:id/approve      money arrived: extend the store's subscription
// POST /platform/payments/:id/reject       { reason }

import { Router } from "express";
import { Op, fn, col } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { approveManualPayment, formatPayment, rejectManualPayment } from "../../services/billing.js";
import { readProof } from "../../services/paymentProofs.js";
import { subscriptionState } from "../../services/subscription.js";
import { handler, notFound, pagination, paginationMeta } from "../../utils/http.js";

const { subscriptionPayment: Payment, tenant: Tenant, plan: Plan, min_user } = db;

const router = Router();

router.use("/platform/payments", can(PERMISSIONS.PLATFORM_MANAGE));

const STATUSES = ["pending", "paid", "rejected"];

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 7;

/** { TZS: { amount, count } } for paid payments since `since` (all time when null). */
const revenueSince = async (since) => {
    const where = { status: "paid" };

    if (since) {
        where.paidAt = { [Op.gte]: since };
    }

    const rows = await Payment.findAll({
        where,
        attributes: ["currency", [fn("SUM", col("amount")), "amount"], [fn("COUNT", col("id")), "count"]],
        group: ["currency"],
        raw: true,
    });

    return Object.fromEntries(rows.map((row) => [row.currency, { amount: Number(row.amount), count: Number(row.count) }]));
};

const storeRow = (tenant, endsAt) => ({
    id: tenant.id,
    name: tenant.name,
    phone: tenant.phone,
    subscriptionStatus: tenant.subscriptionStatus,
    endsAt,
});

const withDetails = async (payment) => {
    const fresh = await Payment.findByPk(payment.id, {
        include: [
            { model: Plan, as: "plan" },
            { model: Tenant, as: "tenant", attributes: ["id", "name", "phone"] },
        ],
    });

    return format(fresh);
};

const format = (payment, submitters = {}) => ({
    ...formatPayment(payment),
    store: payment.tenant ? { id: payment.tenant.id, name: payment.tenant.name, phone: payment.tenant.phone } : null,
    submittedBy: submitters[payment.createdBy] || null,
});

router.get(
    "/platform/payments/summary",
    handler(async (req, res) => {
        // Server-local calendar, same as the store dashboard.
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const yearStart = new Date(now.getFullYear(), 0, 1);

        const [today, month, year, all, byChannel, waiting, tenants] = await Promise.all([
            revenueSince(todayStart),
            revenueSince(monthStart),
            revenueSince(yearStart),
            revenueSince(null),
            Payment.findAll({
                where: { status: "paid", paidAt: { [Op.gte]: yearStart } },
                attributes: ["channel", "currency", [fn("SUM", col("amount")), "amount"], [fn("COUNT", col("id")), "count"]],
                group: ["channel", "currency"],
                raw: true,
            }),
            Payment.findAll({
                where: { provider: "manual", status: "pending" },
                attributes: ["currency", [fn("SUM", col("amount")), "amount"], [fn("COUNT", col("id")), "count"]],
                group: ["currency"],
                raw: true,
            }),
            Tenant.findAll({ attributes: ["id", "name", "phone", "status", "subscriptionStatus", "trialEndsAt", "subscriptionEndsAt"] }),
        ]);

        const stores = { total: tenants.length, paying: 0, trial: 0, suspended: 0, expiringSoon: [], expired: [] };
        const soon = now.getTime() + EXPIRING_DAYS * DAY_MS;

        for (const tenant of tenants) {
            const state = subscriptionState(tenant, now);
            const endsAt = tenant.subscriptionStatus === "trial" ? tenant.trialEndsAt : tenant.subscriptionEndsAt;

            if (tenant.status !== "active") {
                stores.suspended += 1;
            } else if (!state.ok) {
                stores.expired.push(storeRow(tenant, endsAt));
            } else {
                if (tenant.subscriptionStatus === "trial") stores.trial += 1;
                else stores.paying += 1;

                if (endsAt && new Date(endsAt).getTime() <= soon) {
                    stores.expiringSoon.push(storeRow(tenant, endsAt));
                }
            }
        }

        const byDate = (a, b) => new Date(a.endsAt || 0) - new Date(b.endsAt || 0);
        stores.expiringSoon.sort(byDate);
        stores.expired.sort((a, b) => byDate(b, a));

        return res.json({
            successful: true,
            data: {
                revenue: { today, month, year, all },
                byChannelThisYear: byChannel.map((row) => ({
                    channel: row.channel || "Other",
                    currency: row.currency,
                    amount: Number(row.amount),
                    count: Number(row.count),
                })),
                waiting: waiting.map((row) => ({ currency: row.currency, amount: Number(row.amount), count: Number(row.count) })),
                stores,
                expiringDays: EXPIRING_DAYS,
            },
        });
    })
);

router.get(
    "/platform/payments",
    handler(async (req, res) => {
        const page = pagination(req.query, { defaultLimit: 30, maxLimit: 100 });
        const where = { provider: "manual" };

        if (STATUSES.includes(req.query.status)) {
            where.status = req.query.status;
        } else if (req.query.status !== "all") {
            where.status = "pending";
        }

        const { rows, count } = await Payment.findAndCountAll({
            where,
            include: [
                { model: Plan, as: "plan" },
                { model: Tenant, as: "tenant", attributes: ["id", "name", "phone"] },
            ],
            // Oldest first while waiting, newest first in the history.
            order: [["createdAt", where.status === "pending" ? "ASC" : "DESC"]],
            limit: page.limit,
            offset: page.offset,
        });

        const userIds = [...new Set(rows.map((row) => row.createdBy).filter(Boolean))];
        const users = userIds.length
            ? await min_user.findAll({ where: { id: userIds }, attributes: ["id", "first_name", "last_name", "phone"] })
            : [];
        const submitters = Object.fromEntries(
            users.map((user) => [user.id, { name: `${user.first_name || ""} ${user.last_name || ""}`.trim(), phone: user.phone }])
        );

        const pending = await Payment.count({ where: { provider: "manual", status: "pending" } });

        return res.json({
            successful: true,
            data: rows.map((row) => format(row, submitters)),
            pagination: paginationMeta(page, count),
            summary: { pending },
        });
    })
);

router.get(
    "/platform/payments/:id/proof",
    handler(async (req, res) => {
        const payment = await Payment.findOne({ where: { id: req.params.id, provider: "manual" } });

        if (!payment) {
            throw notFound("Payment not found");
        }

        const image = await readProof(payment.id);

        if (!image) {
            throw notFound("The screenshot for this payment is missing");
        }

        return res.json({ successful: true, data: { image } });
    })
);

router.post(
    "/platform/payments/:id/approve",
    handler(async (req, res) => {
        const payment = await approveManualPayment(req.params.id);
        const data = await withDetails(payment);

        return res.json({
            successful: true,
            message: `Approved. ${data.store?.name || "The store"} is paid until ${new Date(data.periodEnd).toDateString()}.`,
            data,
        });
    })
);

router.post(
    "/platform/payments/:id/reject",
    handler(async (req, res) => {
        const payment = await rejectManualPayment(req.params.id, req.body?.reason);

        return res.json({ successful: true, message: "Payment rejected", data: await withDetails(payment) });
    })
);

export default router;
