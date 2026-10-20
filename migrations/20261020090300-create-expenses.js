"use strict";

import { v4 as uuidv4 } from "uuid";
import { DEFAULT_EXPENSE_CATEGORIES } from "../config/defaults.js";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("expenseCategories", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            tenantId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "tenants",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            name: {
                type: Sequelize.STRING(100),
                allowNull: false,
            },
            description: {
                type: Sequelize.STRING(255),
                allowNull: true,
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

        await queryInterface.addIndex("expenseCategories", ["tenantId", "name"], {
            unique: true,
            name: "expense_categories_tenant_name_unique",
        });

        await queryInterface.createTable("expenses", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            tenantId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "tenants",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            categoryId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "expenseCategories",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            expenseDate: {
                type: Sequelize.DATEONLY,
                allowNull: false,
            },
            // cash | card | mobile | bank
            paymentMethod: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "cash",
            },
            payee: {
                type: Sequelize.STRING(150),
                allowNull: true,
            },
            reference: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            description: {
                type: Sequelize.STRING(500),
                allowNull: true,
            },
            userId: {
                type: Sequelize.CHAR(36),
                allowNull: false,
                references: {
                    model: "min_user",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
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

        await queryInterface.addIndex("expenses", ["tenantId", "expenseDate"], {
            name: "expenses_tenant_date_idx",
        });

        await queryInterface.addIndex("expenses", ["tenantId", "categoryId"], {
            name: "expenses_tenant_category_idx",
        });

        // Default categories for tenants that already exist.
        const [tenants] = await queryInterface.sequelize.query("SELECT id FROM tenants");
        const now = new Date();

        const rows = tenants.flatMap((tenant) =>
            DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
                id: uuidv4(),
                tenantId: tenant.id,
                name,
                status: "active",
                createdAt: now,
                updatedAt: now,
            }))
        );

        if (rows.length > 0) {
            await queryInterface.bulkInsert("expenseCategories", rows);
        }
    },

    async down(queryInterface) {
        await queryInterface.dropTable("expenses");
        await queryInterface.dropTable("expenseCategories");
    },
};
