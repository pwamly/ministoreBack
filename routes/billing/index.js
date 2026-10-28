"use strict";

// GET  /billing                      plans to choose from, current subscription, recent payments
// POST /billing/checkout             { planCode?, periods?, phone } -> sends the payment prompt
// GET  /billing/payments/:reference  payment status (poll after checkout)
//
// Reachable while the subscription is expired (see isAuth), so the
// owner can pay to get the store back.

import { Router } from "express";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { subscriptionState } from "../../services/subscription.js";
import { MAX_PERIODS, confirmPayment, formatPayment, startCheckout } from "../../services/billing.js";
import { defaultProvider } from "../../services/payments/index.js";
import { handler, notFound } from "../../utils/http.js";

const { plan: Plan, subscriptionPayment: Payment } = db;

const router = Router();

router.use("/billing", can(PERMISSIONS.SETTINGS_MANAGE));

router.get(
    "/billing",
    handler(async (req, res) => {
        const tenant = req.tenant;
        const state = subscriptionState(tenant);

        const [plans, payments] = await Promise.all([
            Plan.findAll({ where: { status: "active" }, order: [["price", "ASC"]] }),
            Payment.findAll({
                where: { tenantId: req.tenantId },
                include: [{ model: Plan, as: "plan" }],
                order: [["createdAt", "DESC"]],
                limit: 20,
            }),
        ]);

        return res.json({
            successful: true,
            data: {
                paymentsEnabled: defaultProvider.isConfigured(),
                maxPeriods: MAX_PERIODS,
                subscription: {
                    status: tenant.subscriptionStatus,
                    active: state.ok,
                    message: state.reason || null,
                    planCode: tenant.plan?.code || null,
                    trialEndsAt: tenant.trialEndsAt,
                    subscriptionEndsAt: tenant.subscriptionEndsAt,
                },
                plans: plans.map((plan) => ({
                    code: plan.code,
                    name: plan.name,
                    price: Number(plan.price),
                    currency: plan.currency,
                    billingCycle: plan.billingCycle,
                    maxUsers: plan.maxUsers,
                    maxProducts: plan.maxProducts,
                    modules: plan.modules,
                })),
                payments: payments.map(formatPayment),
            },
        });
    })
);

router.post(
    "/billing/checkout",
    handler(async (req, res) => {
        const { planCode, periods, phone } = req.body;

        const payment = await startCheckout({ tenant: req.tenant, user: req.user, planCode, periods, phone });

        return res.status(201).json({
            successful: true,
            message: "Check your phone and enter your PIN to confirm the payment.",
            data: formatPayment(payment),
        });
    })
);

router.get(
    "/billing/payments/:reference",
    handler(async (req, res) => {
        const existing = await Payment.findOne({
            where: { orderReference: req.params.reference, tenantId: req.tenantId },
        });

        if (!existing) {
            throw notFound("Payment not found");
        }

        await confirmPayment(existing.orderReference);

        const payment = await Payment.findByPk(existing.id, { include: [{ model: Plan, as: "plan" }] });

        return res.json({ successful: true, data: formatPayment(payment) });
    })
);

export default router;
