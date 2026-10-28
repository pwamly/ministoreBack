"use strict";

import { addForeignKey } from "../utils/schema.js";

// One row per attempt by a store to pay for its subscription.
// A paid row records the period it bought.

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("subscriptionPayments", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            tenantId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: "tenants", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            // Plan being paid for; becomes the tenant's plan once paid
            planId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: "plans", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            // Number of billing cycles bought
            periods: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            currency: {
                type: Sequelize.STRING(10),
                allowNull: false,
            },
            provider: {
                type: Sequelize.STRING(30),
                allowNull: false,
            },
            // Our reference, sent to the provider (alphanumeric, max 20)
            orderReference: {
                type: Sequelize.STRING(20),
                allowNull: false,
                unique: true,
            },
            providerPaymentId: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            // M-PESA, TIGO-PESA, AIRTEL-MONEY ...
            channel: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },
            phone: {
                type: Sequelize.STRING(20),
                allowNull: true,
            },
            // pending | paid | failed | review (paid the wrong amount)
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "pending",
            },
            message: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            periodStart: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            periodEnd: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            paidAt: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            createdBy: {
                type: Sequelize.CHAR(36),
                allowNull: true,
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

        await addForeignKey(queryInterface, {
            table: "subscriptionPayments",
            column: "createdBy",
            refTable: "min_user",
            onDelete: "SET NULL",
        });

        await queryInterface.addIndex("subscriptionPayments", ["tenantId", "createdAt"], {
            name: "subscription_payments_tenant_created_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("subscriptionPayments");
    },
};
