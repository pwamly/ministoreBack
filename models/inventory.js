"use strict";

// Current stock level of a product. Changed only through
// services/stock.js, which also writes a stockMovements row.

export default (sequelize, DataTypes) => {
    const inventory = sequelize.define(
        "inventory",
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

            productId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            quantity: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },

            // At or below this quantity the product is "low stock".
            reorderLevel: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },

            reorderQuantity: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },

            location: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            batchNumber: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            expiryDate: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "inventory",
            modelName: "inventory",
            timestamps: true,
            underscored: false,
        }
    );

    inventory.associate = (models) => {
        inventory.belongsTo(models.product, {
            foreignKey: "productId",
            targetKey: "id",
            as: "product",
        });
    };

    return inventory;
};
