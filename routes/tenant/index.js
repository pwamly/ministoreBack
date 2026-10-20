"use strict";

// GET /tenant   store profile, plan, usage
// PUT /tenant   update store profile and settings (owner)

import { Router } from "express";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { subscriptionState } from "../../services/subscription.js";
import { handler, badRequest, cleanString } from "../../utils/http.js";

const { product, min_user } = db;

const router = Router();

const formatTenant = async (tenant) => {
    const [users, products] = await Promise.all([
        min_user.count({ where: { tenantId: tenant.id, status: "active" } }),
        product.count({ where: { tenantId: tenant.id } }),
    ]);

    return {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        address: tenant.address,
        currency: tenant.currency,
        allowNegativeStock: tenant.allowNegativeStock,
        subscription: {
            status: tenant.subscriptionStatus,
            trialEndsAt: tenant.trialEndsAt,
            subscriptionEndsAt: tenant.subscriptionEndsAt,
            expiresAt: subscriptionState(tenant).expiresAt || null,
        },
        plan: tenant.plan
            ? {
                  code: tenant.plan.code,
                  name: tenant.plan.name,
                  price: Number(tenant.plan.price),
                  currency: tenant.plan.currency,
                  billingCycle: tenant.plan.billingCycle,
                  modules: tenant.plan.modules,
                  maxUsers: tenant.plan.maxUsers,
                  maxProducts: tenant.plan.maxProducts,
              }
            : null,
        usage: { users, products },
    };
};

router.get(
    "/tenant",
    can(PERMISSIONS.SETTINGS_MANAGE),
    handler(async (req, res) => res.json({ successful: true, data: await formatTenant(req.tenant) }))
);

router.put(
    "/tenant",
    can(PERMISSIONS.SETTINGS_MANAGE),
    handler(async (req, res) => {
        const tenant = req.tenant;
        const changes = {};

        for (const field of ["name", "email", "phone", "address", "currency"]) {
            if (req.body[field] !== undefined) {
                changes[field] = cleanString(req.body[field]);
            }
        }

        if (changes.name === null) {
            throw badRequest("Store name cannot be empty");
        }

        if (changes.currency === null) {
            throw badRequest("Currency cannot be empty");
        }

        if (req.body.allowNegativeStock !== undefined) {
            changes.allowNegativeStock = Boolean(req.body.allowNegativeStock);
        }

        await tenant.update(changes);

        return res.json({ successful: true, message: "Store settings saved", data: await formatTenant(tenant) });
    })
);

export default router;
