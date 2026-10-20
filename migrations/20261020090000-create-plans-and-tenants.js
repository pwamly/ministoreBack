"use strict";

import { v4 as uuidv4 } from "uuid";
import env from "../config/env.cjs";

// Seeded plans. Prices are placeholders: set real prices in the
// `plans` table (or via the platform API) before selling.
const PLANS = [
    {
        code: "starter",
        name: "Starter",
        maxUsers: 2,
        maxProducts: 500,
        modules: ["inventory"],
    },
    {
        code: "business",
        name: "Business",
        maxUsers: 10,
        maxProducts: 5000,
        modules: ["inventory", "expenses", "loans"],
    },
    {
        code: "enterprise",
        name: "Enterprise",
        maxUsers: null,
        maxProducts: null,
        modules: ["inventory", "expenses", "loans"],
    },
];

export default {
    async up(queryInterface, Sequelize) {
        const now = new Date();

        await queryInterface.createTable("plans", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            code: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true,
            },
            name: {
                type: Sequelize.STRING(100),
                allowNull: false,
            },
            price: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            currency: {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: "TZS",
            },
            billingCycle: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "monthly",
            },
            // NULL = unlimited
            maxUsers: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            maxProducts: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },
            // JSON array of module keys, stored as text for MariaDB/MySQL parity
            modules: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
        });

        await queryInterface.createTable("tenants", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            name: {
                type: Sequelize.STRING(150),
                allowNull: false,
            },
            slug: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true,
            },
            email: {
                type: Sequelize.STRING(150),
                allowNull: true,
            },
            phone: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            address: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            currency: {
                type: Sequelize.STRING(10),
                allowNull: false,
                defaultValue: "TZS",
            },
            planId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "plans",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            // active | suspended
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },
            // trial | active | past_due | cancelled
            subscriptionStatus: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "trial",
            },
            trialEndsAt: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            // NULL = no end date
            subscriptionEndsAt: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            // When false, a sale cannot take stock below zero.
            allowNegativeStock: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
        });

        const planIds = {};

        await queryInterface.bulkInsert(
            "plans",
            PLANS.map((plan) => {
                planIds[plan.code] = uuidv4();

                return {
                    id: planIds[plan.code],
                    code: plan.code,
                    name: plan.name,
                    price: 0,
                    currency: env.str("DEFAULT_CURRENCY", "TZS"),
                    billingCycle: "monthly",
                    maxUsers: plan.maxUsers,
                    maxProducts: plan.maxProducts,
                    modules: JSON.stringify(plan.modules),
                    status: "active",
                    createdAt: now,
                    updatedAt: now,
                };
            })
        );

        // -------------------------------------------------
        // Default tenant for data that existed before SaaS.
        // Only created when there is something to adopt.
        // -------------------------------------------------

        const [[{ total }]] = await queryInterface.sequelize.query(
            `SELECT
                (SELECT COUNT(*) FROM min_user) +
                (SELECT COUNT(*) FROM products) +
                (SELECT COUNT(*) FROM sales) AS total`
        );

        if (Number(total) > 0) {
            await queryInterface.bulkInsert("tenants", [
                {
                    id: uuidv4(),
                    name: env.str("DEFAULT_TENANT_NAME", "Main Store"),
                    slug: "main-store",
                    currency: env.str("DEFAULT_CURRENCY", "TZS"),
                    planId: planIds.enterprise,
                    status: "active",
                    subscriptionStatus: "active",
                    trialEndsAt: null,
                    subscriptionEndsAt: null,
                    // Existing products have no stock records yet, so
                    // blocking negative stock would stop checkout.
                    allowNegativeStock: true,
                    createdAt: now,
                    updatedAt: now,
                },
            ]);
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable("tenants");
        await queryInterface.dropTable("plans");
    },
};
