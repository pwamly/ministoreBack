"use strict";

import config from "../config/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Can this tenant use the system right now?
 *
 * @returns {{ ok: boolean, reason?: string, expiresAt?: Date|null }}
 */
export const subscriptionState = (tenant, now = new Date()) => {
    if (!tenant) {
        return { ok: false, reason: "Store not found" };
    }

    if (tenant.status !== "active") {
        return { ok: false, reason: "This store has been suspended. Contact support." };
    }

    const graceMs = config.saas.graceDays * DAY_MS;

    switch (tenant.subscriptionStatus) {
        case "trial": {
            const endsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;

            if (endsAt && endsAt.getTime() + graceMs < now.getTime()) {
                return { ok: false, reason: "Your free trial has ended. Please subscribe to continue." };
            }

            return { ok: true, expiresAt: endsAt };
        }

        case "active":
        case "past_due": {
            const endsAt = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt) : null;

            if (endsAt && endsAt.getTime() + graceMs < now.getTime()) {
                return { ok: false, reason: "Your subscription has expired. Please renew to continue." };
            }

            return { ok: true, expiresAt: endsAt };
        }

        default:
            return { ok: false, reason: "Your subscription is not active. Please subscribe to continue." };
    }
};
