"use strict";

import { v4 as uuidv4 } from "uuid";

import db from "../models/index.js";
import config from "../config/index.js";
import { DEFAULT_EXPENSE_CATEGORIES } from "../config/defaults.js";
import { ROLES } from "../config/permissions.js";
import { badRequest, conflict } from "../utils/http.js";
import { Op } from "sequelize";

const DAY_MS = 24 * 60 * 60 * 1000;

const slugify = (value) =>
    String(value)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "store";

const uniqueSlug = async (name, transaction) => {
    const base = slugify(name);
    let slug = base;

    while (await db.tenant.findOne({ where: { slug }, transaction })) {
        slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    }

    return slug;
};

/** Throws 409 if username/email/phone is taken by any user. */
export const assertUserIsUnique = async ({ username, email, phone }, transaction, excludeId) => {
    const existing = await db.min_user.findOne({
        where: {
            [Op.or]: [{ username }, { email }, { phone }],
            ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
        },
        transaction,
    });

    if (existing) {
        const field =
            existing.username === username ? "Username" : existing.email === email ? "Email" : "Phone";

        throw conflict(`${field} is already in use`);
    }
};

export const validateNewUser = ({ first_name, last_name, username, email, phone, password }) => {
    if (!first_name || !last_name || !username || !email || !phone || !password) {
        throw badRequest("First name, last name, username, email, phone and password are required");
    }

    if (String(password).length < 6) {
        throw badRequest("Password must be at least 6 characters");
    }
};

/**
 * Create a store with its owner account and default data.
 *
 * @param {object} args
 * @param {object} args.store  { name, email, phone, address, currency }
 * @param {object} args.owner  { first_name, last_name, username, email, phone, password }
 * @param {string} [args.planCode]
 * @param {"trial"|"active"} [args.subscriptionStatus]
 * @param {Date|null} [args.subscriptionEndsAt]
 */
export const createTenantWithOwner = async ({
    store,
    owner,
    planCode = config.saas.defaultPlanCode,
    subscriptionStatus = "trial",
    subscriptionEndsAt = null,
}) => {
    if (!store?.name || !String(store.name).trim()) {
        throw badRequest("Store name is required");
    }

    validateNewUser(owner);

    return db.sequelize.transaction(async (transaction) => {
        const plan = await db.plan.findOne({ where: { code: planCode }, transaction });

        if (!plan) {
            throw badRequest(`Unknown plan "${planCode}"`);
        }

        await assertUserIsUnique(owner, transaction);

        const tenant = await db.tenant.create(
            {
                id: uuidv4(),
                name: String(store.name).trim(),
                slug: await uniqueSlug(store.name, transaction),
                email: store.email || owner.email,
                phone: store.phone || owner.phone,
                address: store.address || null,
                currency: store.currency || config.saas.defaultCurrency,
                planId: plan.id,
                status: "active",
                subscriptionStatus,
                trialEndsAt:
                    subscriptionStatus === "trial"
                        ? new Date(Date.now() + config.saas.trialDays * DAY_MS)
                        : null,
                subscriptionEndsAt,
                allowNegativeStock: false,
            },
            { transaction }
        );

        await db.expenseCategory.bulkCreate(
            DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
                id: uuidv4(),
                tenantId: tenant.id,
                name,
            })),
            { transaction }
        );

        const user = await db.min_user.create(
            {
                id: uuidv4(),
                tenantId: tenant.id,
                first_name: owner.first_name,
                last_name: owner.last_name,
                username: owner.username,
                email: owner.email,
                phone: owner.phone,
                password: owner.password,
                signature: owner.signature || `${owner.first_name} ${owner.last_name}`,
                userRole: ROLES.OWNER,
                status: "active",
                token_version: 0,
            },
            { transaction }
        );

        return { tenant, user, plan };
    });
};
