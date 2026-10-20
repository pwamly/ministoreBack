"use strict";

export const STOCK_MOVEMENT_TYPES = {
    OPENING: "opening",
    PURCHASE: "purchase",
    SALE: "sale",
    ADJUSTMENT: "adjustment",
    RETURN: "return",
    DAMAGE: "damage",
};

export default (sequelize, DataTypes) => {
    const stockMovement = sequelize.define(
        "stockMovement",
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

            type: {
                type: DataTypes.STRING(30),
                allowNull: false,
            },

            // Signed: positive adds stock, negative removes it.
            quantity: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
            },

            balanceAfter: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
            },

            unitCost: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            referenceType: {
                type: DataTypes.STRING(30),
                allowNull: true,
            },

            referenceId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            supplierId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            note: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },

            userId: {
                type: DataTypes.CHAR(36),
                allowNull: false,
            },
        },
        {
            tableName: "stockMovements",
            modelName: "stockMovement",
            timestamps: true,
            underscored: false,
        }
    );

    stockMovement.associate = (models) => {
        stockMovement.belongsTo(models.product, {
            foreignKey: "productId",
            targetKey: "id",
            as: "product",
        });

        stockMovement.belongsTo(models.supplier, {
            foreignKey: "supplierId",
            targetKey: "id",
            as: "supplier",
        });

        stockMovement.belongsTo(models.min_user, {
            foreignKey: "userId",
            targetKey: "id",
            as: "user",
        });
    };

    return stockMovement;
};
