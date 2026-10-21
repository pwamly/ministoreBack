"use strict";

// =====================================================
// PLATFORM ADMIN (super_admin only, no tenant)
// =====================================================
//
// GET  /platform/plans
// PUT  /platform/plans/:id           price, limits, modules
// GET  /platform/tenants
// POST /platform/tenants             new store + owner
// PUT  /platform/tenants/:id         plan, status, subscription dates
// GET  /platform/catalog              global product catalog
// PUT  /platform/catalog/:id          correct / verify a catalog item

import { Router } from "express";
import { Op } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS, MODULES } from "../../config/permissions.js";
import { createTenantWithOwner } from "../../services/tenantSetup.js";
import { searchCatalog, formatCatalogItem } from "../products/catalog.js";
import { catalogNameKey } from "../../models/catalogItem.js";
import { applyCatalogToStores } from "../../services/catalog.js";
import { subscriptionState } from "../../services/subscription.js";
import { handler, badRequest, notFound, cleanString, isProvided, requireNumber } from "../../utils/http.js";

const { tenant: Tenant, plan: Plan, min_user } = db;

const router = Router();

router.use("/platform", can(PERMISSIONS.PLATFORM_MANAGE));

const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "cancelled"];

const parseDate = (value, label) => {
    if (value === null || value === "") {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw badRequest(`${label} must be a valid date`);
    }

    return date;
};

const formatTenant = (tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    email: tenant.email,
    phone: tenant.phone,
    status: tenant.status,
    plan: tenant.plan ? { id: tenant.plan.id, code: tenant.plan.code, name: tenant.plan.name } : null,
    subscriptionStatus: tenant.subscriptionStatus,
    trialEndsAt: tenant.trialEndsAt,
    subscriptionEndsAt: tenant.subscriptionEndsAt,
    canUseSystem: subscriptionState(tenant).ok,
    createdAt: tenant.createdAt,
});

router.get(
    "/platform/plans",
    handler(async (req, res) => {
        const plans = await Plan.findAll({ order: [["price", "ASC"]] });

        return res.json({ successful: true, data: plans, modules: Object.values(MODULES) });
    })
);

router.put(
    "/platform/plans/:id",
    handler(async (req, res) => {
        const plan = await Plan.findByPk(req.params.id);

        if (!plan) {
            throw notFound("Plan not found");
        }

        const changes = {};

        if (req.body.name !== undefined) changes.name = cleanString(req.body.name);
        if (req.body.price !== undefined) changes.price = requireNumber(req.body.price, "Price", { min: 0 });
        if (req.body.currency !== undefined) changes.currency = cleanString(req.body.currency);
        if (req.body.billingCycle !== undefined) changes.billingCycle = cleanString(req.body.billingCycle);
        if (req.body.status !== undefined) changes.status = req.body.status;

        for (const field of ["maxUsers", "maxProducts"]) {
            if (req.body[field] !== undefined) {
                changes[field] = req.body[field] === null ? null : requireNumber(req.body[field], field, { min: 1 });
            }
        }

        if (req.body.modules !== undefined) {
            const valid = Object.values(MODULES);

            if (!Array.isArray(req.body.modules) || req.body.modules.some((module) => !valid.includes(module))) {
                throw badRequest(`modules must be a list of: ${valid.join(", ")}`);
            }

            changes.modules = req.body.modules;
        }

        await plan.update(changes);

        return res.json({ successful: true, data: plan });
    })
);

router.get(
    "/platform/tenants",
    handler(async (req, res) => {
        const where = {};

        if (isProvided(req.query.search)) {
            const term = `%${String(req.query.search).trim()}%`;

            where[Op.or] = [{ name: { [Op.like]: term } }, { email: { [Op.like]: term } }, { phone: { [Op.like]: term } }];
        }

        const tenants = await Tenant.findAll({
            where,
            include: [{ model: Plan, as: "plan" }],
            order: [["createdAt", "DESC"]],
        });

        return res.json({ successful: true, data: tenants.map(formatTenant) });
    })
);

router.post(
    "/platform/tenants",
    handler(async (req, res) => {
        const { store = {}, owner = {}, planCode, subscriptionStatus = "trial", subscriptionEndsAt } = req.body;

        if (!SUBSCRIPTION_STATUSES.includes(subscriptionStatus)) {
            throw badRequest(`subscriptionStatus must be one of: ${SUBSCRIPTION_STATUSES.join(", ")}`);
        }

        const { tenant, user, plan } = await createTenantWithOwner({
            store,
            owner,
            planCode,
            subscriptionStatus,
            subscriptionEndsAt: subscriptionEndsAt ? parseDate(subscriptionEndsAt, "subscriptionEndsAt") : null,
        });

        tenant.plan = plan;

        return res.status(201).json({
            successful: true,
            message: "Store created",
            data: { tenant: formatTenant(tenant), owner: { id: user.id, username: user.username } },
        });
    })
);

router.put(
    "/platform/tenants/:id",
    handler(async (req, res) => {
        const tenant = await Tenant.findByPk(req.params.id);

        if (!tenant) {
            throw notFound("Store not found");
        }

        const changes = {};
        const body = req.body;

        if (body.status !== undefined) {
            if (!["active", "suspended"].includes(body.status)) {
                throw badRequest("status must be active or suspended");
            }

            changes.status = body.status;
        }

        if (body.subscriptionStatus !== undefined) {
            if (!SUBSCRIPTION_STATUSES.includes(body.subscriptionStatus)) {
                throw badRequest(`subscriptionStatus must be one of: ${SUBSCRIPTION_STATUSES.join(", ")}`);
            }

            changes.subscriptionStatus = body.subscriptionStatus;
        }

        if (body.trialEndsAt !== undefined) changes.trialEndsAt = parseDate(body.trialEndsAt, "trialEndsAt");
        if (body.subscriptionEndsAt !== undefined) {
            changes.subscriptionEndsAt = parseDate(body.subscriptionEndsAt, "subscriptionEndsAt");
        }

        if (body.planCode !== undefined) {
            const plan = await Plan.findOne({ where: { code: body.planCode } });

            if (!plan) {
                throw badRequest(`Unknown plan "${body.planCode}"`);
            }

            changes.planId = plan.id;
        }

        await tenant.update(changes);

        // Suspending a store signs out all its users.
        if (changes.status === "suspended") {
            await min_user.increment("token_version", { by: 1, where: { tenantId: tenant.id } });
        }

        await tenant.reload({ include: [{ model: Plan, as: "plan" }] });

        return res.json({ successful: true, data: formatTenant(tenant) });
    })
);

// =====================================================
// GLOBAL CATALOG
// =====================================================

router.get(
    "/platform/catalog",
    handler(async (req, res) => {
        const { rows, pagination: meta } = await searchCatalog(req.query);

        return res.json({ successful: true, data: rows.map(formatCatalogItem), pagination: meta });
    })
);

const CATALOG_TEXT_FIELDS = [
    "name",
    "barcode",
    "description",
    "productType",
    "flavor",
    "size",
    "weightUnit",
    "packagingType",
    "manufacturer",
    "countryOfOrigin",
];

// Shared lookups for the catalog editor (tenantId NULL only).
router.get(
    "/platform/lookups",
    handler(async (req, res) => {
        const options = { where: { tenantId: null }, attributes: ["id", "name"], order: [["name", "ASC"]] };

        const [categories, brands, units] = await Promise.all([
            db.category.findAll(options),
            db.brand.findAll(options),
            db.unit.findAll(options),
        ]);

        return res.json({ successful: true, data: { categories, brands, units } });
    })
);

const LOOKUP_FIELDS = [
    ["brandId", "brand"],
    ["categoryId", "category"],
    ["unitId", "unit"],
];

/**
 * body: any catalog field, plus `applyToStores: true` to copy the
 * changes onto every store product linked to this item.
 */
router.put(
    "/platform/catalog/:id",
    handler(async (req, res) => {
        const result = await db.sequelize.transaction(async (transaction) => {
            const item = await db.catalogItem.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });

            if (!item) {
                throw notFound("Catalog item not found");
            }

            const changes = {};

            for (const field of CATALOG_TEXT_FIELDS) {
                if (req.body[field] !== undefined) {
                    changes[field] = cleanString(req.body[field]);
                }
            }

            if (changes.name === null) {
                throw badRequest("Name cannot be empty");
            }

            if (changes.name) {
                changes.nameKey = catalogNameKey(changes.name);
            }

            if (req.body.netWeight !== undefined) {
                changes.netWeight =
                    req.body.netWeight === null || req.body.netWeight === ""
                        ? null
                        : requireNumber(req.body.netWeight, "Net weight", { min: 0 });
            }

            // Only shared (tenantId NULL) lookups belong in the catalog.
            for (const [field, model] of LOOKUP_FIELDS) {
                if (req.body[field] !== undefined) {
                    if (!req.body[field]) {
                        changes[field] = null;
                    } else {
                        const row = await db[model].findOne({ where: { id: req.body[field], tenantId: null }, transaction });

                        if (!row) {
                            throw badRequest(`Unknown ${model}`);
                        }

                        changes[field] = row.id;
                    }
                }
            }

            if (req.body.verified !== undefined) {
                changes.verified = Boolean(req.body.verified);
            }

            // Fields whose value really changed.
            const changed = Object.keys(changes).filter(
                (field) => field !== "nameKey" && field !== "verified" && String(item[field] ?? "") !== String(changes[field] ?? "")
            );

            await item.update(changes, { transaction });

            const applied = req.body.applyToStores && changed.length
                ? await applyCatalogToStores({ item, changed, transaction })
                : null;

            return { item, applied };
        });

        await result.item.reload({ include: [
            { model: db.brand, as: "brand", attributes: ["id", "name"], required: false },
            { model: db.category, as: "category", attributes: ["id", "name"], required: false },
            { model: db.unit, as: "unit", attributes: ["id", "name"], required: false },
        ] });

        return res.json({
            successful: true,
            data: formatCatalogItem(result.item),
            applied: result.applied,
        });
    })
);

export default router;
