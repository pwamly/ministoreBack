"use strict";

// =====================================================
// MANUAL PAYMENT VERIFICATION (super_admin)
// =====================================================
//
// GET  /platform/payments?status=pending   manual payments to check (status=all for every one)
// GET  /platform/payments/:id/proof        the uploaded screenshot (data URL)
// POST /platform/payments/:id/approve      money arrived: extend the store's subscription
// POST /platform/payments/:id/reject       { reason }

import { Router } from "express";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { approveManualPayment, formatPayment, rejectManualPayment } from "../../services/billing.js";
import { readProof } from "../../services/paymentProofs.js";
import { handler, notFound, pagination, paginationMeta } from "../../utils/http.js";

const { subscriptionPayment: Payment, tenant: Tenant, plan: Plan, min_user } = db;

const router = Router();

router.use("/platform/payments", can(PERMISSIONS.PLATFORM_MANAGE));

const STATUSES = ["pending", "paid", "rejected"];

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
