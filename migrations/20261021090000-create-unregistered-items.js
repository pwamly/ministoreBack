"use strict";

import { addForeignKey, columnSpec, dropForeignKeysOn } from "../utils/schema.js";

// Items sold at checkout that are not (yet) registered products.
// A sale line can now point at an unregistered item instead of a
// product; when a manager registers or links it, the sale lines
// are moved onto the product.

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("unregisteredItems", {
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
            name: {
                type: Sequelize.STRING(200),
                allowNull: false,
            },
            barcode: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },
            // barcode, or the lower-cased name: groups repeat sales of the same item
            matchKey: {
                type: Sequelize.STRING(220),
                allowNull: false,
            },
            // Last price/cost the cashier entered
            sellingPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },
            costPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            quantitySold: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },
            timesSold: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            lastSoldAt: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            // pending | registered | dismissed
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "pending",
            },
            // Set when registered as / linked to a product
            productId: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            createdBy: {
                type: Sequelize.CHAR(36),
                allowNull: false,
            },
            resolvedBy: {
                type: Sequelize.CHAR(36),
                allowNull: true,
            },
            resolvedAt: {
                type: Sequelize.DATE,
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

        await addForeignKey(queryInterface, { table: "unregisteredItems", column: "productId", refTable: "products", onDelete: "SET NULL" });
        await addForeignKey(queryInterface, { table: "unregisteredItems", column: "createdBy", refTable: "min_user", allowNull: false });
        await addForeignKey(queryInterface, { table: "unregisteredItems", column: "resolvedBy", refTable: "min_user", onDelete: "SET NULL" });

        await queryInterface.addIndex("unregisteredItems", ["tenantId", "status", "matchKey"], {
            name: "unregistered_items_tenant_status_key_idx",
        });

        // Manual sale lines have no product. Raw SQL keeps the
        // existing foreign key (changeColumn would try to re-add it).
        await queryInterface.sequelize.query(
            `ALTER TABLE salesItems MODIFY productId ${await columnSpec(queryInterface, "salesItems", "productId")} NULL`
        );

        await queryInterface.addColumn("salesItems", "unregisteredItemId", {
            type: Sequelize.UUID,
            allowNull: true,
        });

        await addForeignKey(queryInterface, {
            table: "salesItems",
            column: "unregisteredItemId",
            refTable: "unregisteredItems",
            onDelete: "SET NULL",
        });
    },

    async down(queryInterface) {
        const [[{ manual }]] = await queryInterface.sequelize.query(
            "SELECT COUNT(*) AS manual FROM salesItems WHERE productId IS NULL"
        );

        if (Number(manual) > 0) {
            throw new Error(
                `${manual} sale lines have no product. Register or link their unregistered items before rolling back.`
            );
        }

        await dropForeignKeysOn(queryInterface, "salesItems", "unregisteredItemId");
        await queryInterface.removeColumn("salesItems", "unregisteredItemId");

        await queryInterface.sequelize.query(
            `ALTER TABLE salesItems MODIFY productId ${await columnSpec(queryInterface, "salesItems", "productId")} NOT NULL`
        );

        await queryInterface.dropTable("unregisteredItems");
    },
};
