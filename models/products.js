"use strict";

export default (sequelize, DataTypes) => {
    const product = sequelize.define(
        "product",
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

            sku: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            itemName: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },

            productName: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },

            description: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            productType: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            brandId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            categoryId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            unitId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            taxGroupId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            status: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "active",
            },

            // Shared identity in the global catalog (models/catalogItem.js)
            catalogItemId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            createdAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },

            updatedAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },
        },
        {
            tableName: "products",
            modelName: "product",
            timestamps: true,
            underscored: false,
        }
    );

    // =====================================================
    // ASSOCIATIONS
    // =====================================================

    product.associate = (models) => {

        product.belongsTo(models.catalogItem, {
            foreignKey: "catalogItemId",
            targetKey: "id",
            as: "catalogItem",
        });

        product.belongsTo(models.brand, {
            foreignKey: "brandId",
            targetKey: "id",
            as: "brand",
        });

        product.belongsTo(models.category, {
            foreignKey: "categoryId",
            targetKey: "id",
            as: "category",
        });

        product.belongsTo(models.unit, {
            foreignKey: "unitId",
            targetKey: "id",
            as: "unit",
        });

        product.belongsTo(models.taxgroup, {
            foreignKey: "taxGroupId",
            targetKey: "id",
            as: "taxGroup",
        });

        product.hasOne(
            models.productdetails,
            {
                foreignKey: "productId",
                sourceKey: "id",
                as: "details",
            }
        );

        product.hasMany(
            models.productbarcode,
            {
                foreignKey: "productId",
                sourceKey: "id",
                as: "barcodes",
            }
        );

        product.hasOne(
            models.inventory,
            {
                foreignKey: "productId",
                sourceKey: "id",
                as: "inventory",
            }
        );

        product.hasOne(
            models.productregulatory,
            {
                foreignKey: "productId",
                sourceKey: "id",
                as: "regulatory",
            }
        );
    };

    return product;
};
