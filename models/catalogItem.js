"use strict";

// Global product catalog: identity of a product, shared by all
// stores. Never holds prices, costs, stock or sales.

export const catalogNameKey = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

export default (sequelize, DataTypes) => {
    const catalogItem = sequelize.define(
        "catalogItem",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            name: { type: DataTypes.STRING(200), allowNull: false },
            barcode: { type: DataTypes.STRING(100), allowNull: true },
            barcodeType: { type: DataTypes.STRING(30), allowNull: true },
            nameKey: { type: DataTypes.STRING(200), allowNull: false },
            description: { type: DataTypes.TEXT, allowNull: true },
            productType: { type: DataTypes.STRING(150), allowNull: true },
            brandId: { type: DataTypes.UUID, allowNull: true },
            categoryId: { type: DataTypes.UUID, allowNull: true },
            unitId: { type: DataTypes.UUID, allowNull: true },
            flavor: { type: DataTypes.STRING(100), allowNull: true },
            size: { type: DataTypes.STRING(50), allowNull: true },
            netWeight: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
            weightUnit: { type: DataTypes.STRING(30), allowNull: true },
            packagingType: { type: DataTypes.STRING(100), allowNull: true },
            manufacturer: { type: DataTypes.STRING(200), allowNull: true },
            countryOfOrigin: { type: DataTypes.STRING(100), allowNull: true },
            verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
            storeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            createdByTenantId: { type: DataTypes.UUID, allowNull: true },
        },
        {
            tableName: "catalogItems",
            modelName: "catalogItem",
            timestamps: true,
            underscored: false,
        }
    );

    catalogItem.associate = (models) => {
        catalogItem.belongsTo(models.brand, { foreignKey: "brandId", targetKey: "id", as: "brand" });
        catalogItem.belongsTo(models.category, { foreignKey: "categoryId", targetKey: "id", as: "category" });
        catalogItem.belongsTo(models.unit, { foreignKey: "unitId", targetKey: "id", as: "unit" });
        catalogItem.hasMany(models.product, { foreignKey: "catalogItemId", sourceKey: "id", as: "storeProducts" });
    };

    return catalogItem;
};
