"use strict";

import { addForeignKey } from "../utils/schema.js";

// Purchase orders to suppliers.
//
// pending   -> prepared, shared with the supplier (PDF / screenshot), editable
// completed -> goods received: stock added, purchase recorded (money out)
// cancelled -> never received

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("purchaseOrders", {
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
            // 1, 2, 3 ... per store, shown as PO-0001
            orderNumber: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            supplierId: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            // pending | completed | cancelled
            status: {
                type: Sequelize.STRING(20),
                allowNull: false,
                defaultValue: "pending",
            },
            expectedDate: {
                type: Sequelize.DATEONLY,
                allowNull: true,
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true,
            },
            // Sum of the line amounts entered so far
            totalAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },
            // How the supplier was paid (set on completion)
            paymentMethod: {
                type: Sequelize.STRING(30),
                allowNull: true,
            },
            createdBy: {
                type: Sequelize.CHAR(36),
                allowNull: false,
            },
            updatedBy: {
                type: Sequelize.CHAR(36),
                allowNull: true,
            },
            completedBy: {
                type: Sequelize.CHAR(36),
                allowNull: true,
            },
            completedAt: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            cancelledBy: {
                type: Sequelize.CHAR(36),
                allowNull: true,
            },
            cancelledAt: {
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

        await addForeignKey(queryInterface, { table: "purchaseOrders", column: "supplierId", refTable: "suppliers", onDelete: "SET NULL" });
        await addForeignKey(queryInterface, { table: "purchaseOrders", column: "createdBy", refTable: "min_user", allowNull: false });
        await addForeignKey(queryInterface, { table: "purchaseOrders", column: "updatedBy", refTable: "min_user", onDelete: "SET NULL" });
        await addForeignKey(queryInterface, { table: "purchaseOrders", column: "completedBy", refTable: "min_user", onDelete: "SET NULL" });
        await addForeignKey(queryInterface, { table: "purchaseOrders", column: "cancelledBy", refTable: "min_user", onDelete: "SET NULL" });

        await queryInterface.addIndex("purchaseOrders", ["tenantId", "orderNumber"], {
            unique: true,
            name: "purchase_orders_tenant_number_unique",
        });

        await queryInterface.addIndex("purchaseOrders", ["tenantId", "status", "createdAt"], {
            name: "purchase_orders_tenant_status_idx",
        });

        await queryInterface.addIndex("purchaseOrders", ["tenantId", "completedAt"], {
            name: "purchase_orders_tenant_completed_idx",
        });

        await queryInterface.createTable("purchaseOrderItems", {
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
            orderId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: "purchaseOrders", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            productId: {
                type: Sequelize.UUID,
                allowNull: false,
            },
            quantity: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
            },
            // What the whole line costs; may be blank until the supplier quotes
            totalAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            // totalAmount / quantity
            unitCost: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            sortOrder: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
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

        await addForeignKey(queryInterface, { table: "purchaseOrderItems", column: "productId", refTable: "products", allowNull: false });

        await queryInterface.addIndex("purchaseOrderItems", ["orderId"], {
            name: "purchase_order_items_order_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("purchaseOrderItems");
        await queryInterface.dropTable("purchaseOrders");
    },
};
