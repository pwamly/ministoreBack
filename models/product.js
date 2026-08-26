"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const product = sequelize.define(
        "product",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                unique: true,
                primaryKey: true,
            },

            sku: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
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
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return product;
};
