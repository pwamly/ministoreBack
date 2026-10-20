"use strict";

// An item a cashier sold that was not in the product list.
// Repeat sales of the same item (same barcode, or same name when
// there is no barcode) accumulate on one pending row.

export const UNREGISTERED_STATUS = {
    PENDING: "pending",
    REGISTERED: "registered",
    DISMISSED: "dismissed",
};

/** Grouping key: barcode when known, otherwise the normalised name. */
export const matchKeyFor = ({ barcode, name }) =>
    barcode ? `barcode:${String(barcode).trim()}` : `name:${String(name).trim().toLowerCase().replace(/\s+/g, " ")}`;

export default (sequelize, DataTypes) => {
    const unregisteredItem = sequelize.define(
        "unregisteredItem",
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

            name: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },

            barcode: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            matchKey: {
                type: DataTypes.STRING(220),
                allowNull: false,
            },

            sellingPrice: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },

            costPrice: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            quantitySold: {
                type: DataTypes.DECIMAL(15, 3),
                allowNull: false,
                defaultValue: 0,
            },

            timesSold: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },

            lastSoldAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },

            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: UNREGISTERED_STATUS.PENDING,
            },

            productId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            createdBy: {
                type: DataTypes.CHAR(36),
                allowNull: false,
            },

            resolvedBy: {
                type: DataTypes.CHAR(36),
                allowNull: true,
            },

            resolvedAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        {
            tableName: "unregisteredItems",
            modelName: "unregisteredItem",
            timestamps: true,
            underscored: false,
        }
    );

    unregisteredItem.associate = (models) => {
        unregisteredItem.belongsTo(models.product, {
            foreignKey: "productId",
            targetKey: "id",
            as: "product",
        });

        unregisteredItem.belongsTo(models.min_user, {
            foreignKey: "createdBy",
            targetKey: "id",
            as: "creator",
        });

        unregisteredItem.hasMany(models.salesItems, {
            foreignKey: "unregisteredItemId",
            sourceKey: "id",
            as: "saleLines",
        });
    };

    return unregisteredItem;
};
