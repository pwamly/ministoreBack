"use strict";

// An order of stock from a supplier. Lines are purchaseOrderItems.
// Completing it adds the stock (services/stock.js) and counts the
// total as money spent on purchases.

export const ORDER_STATUS = {
    PENDING: "pending",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
};

export default (sequelize, DataTypes) => {
    const purchaseOrder = sequelize.define(
        "purchaseOrder",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            tenantId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            orderNumber: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            supplierId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: ORDER_STATUS.PENDING,
            },

            expectedDate: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },

            notes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            totalAmount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            paymentMethod: {
                type: DataTypes.STRING(30),
                allowNull: true,
            },

            createdBy: {
                type: DataTypes.CHAR(36),
                allowNull: false,
            },

            updatedBy: {
                type: DataTypes.CHAR(36),
                allowNull: true,
            },

            completedBy: {
                type: DataTypes.CHAR(36),
                allowNull: true,
            },

            completedAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            cancelledBy: {
                type: DataTypes.CHAR(36),
                allowNull: true,
            },

            cancelledAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "purchaseOrders",
            modelName: "purchaseOrder",
            timestamps: true,
            underscored: false,
        }
    );

    purchaseOrder.associate = (models) => {
        purchaseOrder.hasMany(models.purchaseOrderItem, {
            foreignKey: "orderId",
            sourceKey: "id",
            as: "items",
        });

        purchaseOrder.belongsTo(models.supplier, {
            foreignKey: "supplierId",
            targetKey: "id",
            as: "supplier",
        });

        purchaseOrder.belongsTo(models.min_user, {
            foreignKey: "createdBy",
            targetKey: "id",
            as: "creator",
        });

        purchaseOrder.belongsTo(models.min_user, {
            foreignKey: "completedBy",
            targetKey: "id",
            as: "completer",
        });
    };

    return purchaseOrder;
};
