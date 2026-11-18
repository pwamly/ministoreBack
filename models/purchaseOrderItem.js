"use strict";

// One product line of a purchase order. unitCost = totalAmount / quantity.

export default (sequelize, DataTypes) => {
    const purchaseOrderItem = sequelize.define(
        "purchaseOrderItem",
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

            orderId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            productId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            quantity: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
            },

            totalAmount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            unitCost: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            sortOrder: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
        },
        {
            tableName: "purchaseOrderItems",
            modelName: "purchaseOrderItem",
            timestamps: true,
            underscored: false,
        }
    );

    purchaseOrderItem.associate = (models) => {
        purchaseOrderItem.belongsTo(models.purchaseOrder, {
            foreignKey: "orderId",
            targetKey: "id",
            as: "order",
        });

        purchaseOrderItem.belongsTo(models.product, {
            foreignKey: "productId",
            targetKey: "id",
            as: "product",
        });
    };

    return purchaseOrderItem;
};
