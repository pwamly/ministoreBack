"use strict";

// Stores paying for their own subscription.
//
//   startCheckout   creates a pending payment and sends the prompt to the phone
//   submitManualPayment / approveManualPayment / rejectManualPayment
//                   paid by hand, screenshot checked by a platform admin
//   confirmPayment  asks the provider for the result and, once paid, extends
//                   the tenant's subscription. Safe to call any number of times
//                   (webhook, polling, retries).
//
// The provider's API is the source of truth: webhook bodies are only
// a hint to re-check, so a forged webhook cannot activate a store.

import crypto from "crypto";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import config from "../config/index.js";
import db from "../models/index.js";
import { defaultProvider, getProvider } from "./payments/index.js";
import { decodeProof, saveProof } from "./paymentProofs.js";
import { HttpError, badRequest, notFound } from "../utils/http.js";

const { subscriptionPayment: Payment, tenant: Tenant, plan: Plan, min_user, product } = db;

export const MAX_PERIODS = 12;

const CYCLE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

/** Adds months without rolling over (Jan 31 + 1 month = Feb 28/29). */
const addMonths = (date, months) => {
    const result = new Date(date);
    const day = result.getDate();

    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));

    return result;
};

/** 0712345678 / +255712345678 / 712345678 -> 255712345678 */
export const normalizePhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");

    if (/^0[67]\d{8}$/.test(digits)) return `255${digits.slice(1)}`;
    if (/^[67]\d{8}$/.test(digits)) return `255${digits}`;
    if (/^255[67]\d{8}$/.test(digits)) return digits;

    throw badRequest("Enter a valid Tanzanian mobile number, e.g. 0712345678");
};

// Alphanumeric, max 20 characters (mobile money limit).
const newOrderReference = () => `MS${crypto.randomBytes(9).toString("hex").toUpperCase()}`;

/** When a newly paid period begins: after any time the store still has. */
const periodStartFor = (tenant, now) => {
    const current =
        tenant.subscriptionStatus === "trial" ? tenant.trialEndsAt : tenant.subscriptionEndsAt;

    return current && new Date(current) > now ? new Date(current) : now;
};

export const formatPayment = (payment) => ({
    id: payment.id,
    reference: payment.orderReference,
    provider: payment.provider,
    // What the payer typed from their SMS / bank slip (manual payments).
    transactionId: payment.provider === "manual" ? payment.providerPaymentId : null,
    plan: payment.plan ? { code: payment.plan.code, name: payment.plan.name } : undefined,
    periods: payment.periods,
    amount: Number(payment.amount),
    currency: payment.currency,
    channel: payment.channel,
    phone: payment.phone,
    status: payment.status,
    message: payment.message,
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
});

const assertPlanFits = async (tenant, plan) => {
    const [users, products] = await Promise.all([
        min_user.count({ where: { tenantId: tenant.id, status: "active" } }),
        product.count({ where: { tenantId: tenant.id, status: { [Op.ne]: "removed" } } }),
    ]);

    if (plan.maxUsers && users > plan.maxUsers) {
        throw badRequest(`${plan.name} allows ${plan.maxUsers} active users and you have ${users}. Disable some users first.`);
    }

    if (plan.maxProducts && products > plan.maxProducts) {
        throw badRequest(`${plan.name} allows ${plan.maxProducts} products and you have ${products}. Remove some products first.`);
    }
};

/** Checks a plan/periods choice for this tenant. */
const resolvePlan = async ({ tenant, planCode, periods = 1 }) => {
    if (["active", "past_due"].includes(tenant.subscriptionStatus) && !tenant.subscriptionEndsAt) {
        throw badRequest("Your subscription has no end date, so there is nothing to pay.");
    }

    const count = Number.parseInt(periods, 10);

    if (!Number.isInteger(count) || count < 1 || count > MAX_PERIODS) {
        throw badRequest(`periods must be a whole number from 1 to ${MAX_PERIODS}`);
    }

    const plan = planCode
        ? await Plan.findOne({ where: { code: planCode, status: "active" } })
        : await Plan.findByPk(tenant.planId);

    if (!plan) {
        throw badRequest(`Unknown plan "${planCode}"`);
    }

    if (!(Number(plan.price) > 0)) {
        throw badRequest(`${plan.name} has no price set yet. Contact support.`);
    }

    if (!CYCLE_MONTHS[plan.billingCycle]) {
        throw new HttpError(500, `Plan ${plan.code} has an unsupported billing cycle "${plan.billingCycle}"`);
    }

    if (plan.id !== tenant.planId) {
        await assertPlanFits(tenant, plan);
    }

    return { plan, count };
};

/**
 * @param {object} args
 * @param {object} args.tenant   req.tenant (with plan)
 * @param {object} args.user     paying user
 * @param {string} [args.planCode]  defaults to the tenant's current plan
 * @param {number} [args.periods]   billing cycles to buy, 1..MAX_PERIODS
 * @param {string} args.phone
 */
export const startCheckout = async ({ tenant, user, planCode, periods = 1, phone }) => {
    const provider = defaultProvider;

    if (!provider.isConfigured()) {
        throw new HttpError(503, "Online payments are not available yet. Contact support.", {
            code: "PAYMENTS_DISABLED",
        });
    }

    const { plan, count } = await resolvePlan({ tenant, planCode, periods });

    const payment = await Payment.create({
        id: uuidv4(),
        tenantId: tenant.id,
        planId: plan.id,
        periods: count,
        amount: Number(plan.price) * count,
        currency: plan.currency,
        provider: provider.name,
        orderReference: newOrderReference(),
        phone: normalizePhone(phone),
        status: "pending",
        createdBy: user.id,
    });

    try {
        const result = await provider.initiatePayment({
            amount: Number(payment.amount),
            currency: payment.currency,
            orderReference: payment.orderReference,
            phone: payment.phone,
        });

        await payment.update({ providerPaymentId: result.providerPaymentId, channel: result.channel });
    } catch (error) {
        await payment.update({ status: "failed", message: error.message?.slice(0, 255) || "Could not start payment" });
        throw error;
    }

    payment.plan = plan;

    return payment;
};

/**
 * Marks a pending payment paid and extends the tenant's subscription
 * by its plan and periods. Locks both rows; a payment that is no
 * longer pending is returned untouched (already applied elsewhere).
 */
const activatePayment = (paymentId, changes = {}) =>
    db.sequelize.transaction(async (transaction) => {
        const locked = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });

        if (locked.status !== "pending") {
            return locked;
        }

        const tenant = await Tenant.findByPk(locked.tenantId, { transaction, lock: transaction.LOCK.UPDATE });
        const plan = await Plan.findByPk(locked.planId, { transaction });

        const now = new Date();
        const periodStart = periodStartFor(tenant, now);
        const periodEnd = addMonths(periodStart, CYCLE_MONTHS[plan.billingCycle] * locked.periods);

        await tenant.update(
            {
                planId: plan.id,
                subscriptionStatus: "active",
                subscriptionEndsAt: periodEnd,
            },
            { transaction }
        );

        await locked.update({ status: "paid", paidAt: now, periodStart, periodEnd, message: null, ...changes }, { transaction });

        return locked;
    });

/**
 * Brings a payment up to date with the provider and applies it.
 * @returns the payment (fresh)
 */
export const confirmPayment = async (orderReference) => {
    const payment = await Payment.findOne({ where: { orderReference } });

    if (!payment) {
        throw notFound("Payment not found");
    }

    if (payment.status !== "pending") {
        return payment;
    }

    const provider = getProvider(payment.provider);
    const remote = provider ? await provider.fetchPayment(orderReference) : null;

    if (!remote || remote.status === "pending") {
        return payment;
    }

    if (remote.status === "failed") {
        await payment.update({
            status: "failed",
            message: remote.message?.slice(0, 255) || "Payment was not completed",
            channel: remote.channel || payment.channel,
        });

        return payment;
    }

    // Paid: money was taken, but only activate if it is the full amount.
    if (remote.currency !== payment.currency || !(remote.amount >= Number(payment.amount))) {
        console.error(`Billing: ${orderReference} paid ${remote.amount} ${remote.currency}, expected ${payment.amount} ${payment.currency}`);

        await payment.update({ status: "review", message: `Received ${remote.amount} ${remote.currency}. Support will contact you.` });

        return payment;
    }

    return activatePayment(payment.id, {
        providerPaymentId: remote.providerPaymentId || payment.providerPaymentId,
        channel: remote.channel || payment.channel,
    });
};

// =====================================================
// MANUAL PAYMENTS (mobile money / bank transfer + screenshot)
// =====================================================

const MAX_PENDING_MANUAL = 3;

export const manualPaymentSettings = () => {
    const { enabled, accounts, accountName } = config.payments.manual;

    return { enabled: enabled && accounts.length > 0, accounts, accountName: accountName || null };
};

/**
 * Owner says they paid: records a pending payment with the screenshot.
 * Nothing changes on the subscription until a platform admin approves it.
 */
export const submitManualPayment = async ({ tenant, user, planCode, periods, accountId, transactionId, phone, screenshot }) => {
    const settings = manualPaymentSettings();

    if (!settings.enabled) {
        throw new HttpError(503, "Manual payments are not available. Contact support.", { code: "PAYMENTS_DISABLED" });
    }

    const account = settings.accounts.find((item) => item.id === accountId);

    if (!account) {
        throw badRequest("Choose the account you paid to");
    }

    const reference = String(transactionId || "").trim().toUpperCase();

    if (reference.length < 4 || reference.length > 100) {
        throw badRequest("Enter the transaction ID from the payment message");
    }

    const { plan, count } = await resolvePlan({ tenant, planCode, periods });
    const proof = decodeProof(screenshot);

    const duplicate = await Payment.findOne({
        where: { provider: "manual", providerPaymentId: reference, status: { [Op.in]: ["pending", "paid"] } },
    });

    if (duplicate) {
        throw new HttpError(409, "This transaction ID has already been submitted");
    }

    const pending = await Payment.count({ where: { tenantId: tenant.id, provider: "manual", status: "pending" } });

    if (pending >= MAX_PENDING_MANUAL) {
        throw badRequest("You already have payments waiting for verification. Please wait for them to be checked.");
    }

    const payment = await Payment.create({
        id: uuidv4(),
        tenantId: tenant.id,
        planId: plan.id,
        periods: count,
        amount: Number(plan.price) * count,
        currency: plan.currency,
        provider: "manual",
        orderReference: newOrderReference(),
        providerPaymentId: reference,
        channel: account.label.slice(0, 50),
        phone: String(phone || "").trim() ? normalizePhone(phone) : null,
        status: "pending",
        message: "Waiting for verification",
        createdBy: user.id,
    });

    try {
        await saveProof(payment.id, proof);
    } catch (error) {
        await payment.destroy();
        throw error;
    }

    payment.plan = plan;

    return payment;
};

const findManual = async (paymentId) => {
    const payment = await Payment.findOne({ where: { id: paymentId, provider: "manual" } });

    if (!payment) {
        throw notFound("Payment not found");
    }

    if (payment.status !== "pending") {
        throw badRequest(`This payment is already ${payment.status}`);
    }

    return payment;
};

/** Platform admin checked the money arrived: extend the subscription. */
export const approveManualPayment = async (paymentId) => {
    const payment = await findManual(paymentId);

    return activatePayment(payment.id);
};

export const rejectManualPayment = async (paymentId, reason) => {
    const payment = await findManual(paymentId);
    const message = String(reason || "").trim();

    if (!message) {
        throw badRequest("Give a reason so the store knows what to fix");
    }

    await payment.update({ status: "rejected", message: message.slice(0, 255) });

    return payment;
};
