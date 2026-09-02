"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const productdetails = sequelize.define(
        "productdetails",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                unique: true,
                primaryKey: true,
            },

            productId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            flavor: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            size: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },

            netWeight: {
                type: DataTypes.DECIMAL(12, 3),
                allowNull: true,
            },

            weightUnit: {
                type: DataTypes.STRING(30),
                allowNull: true,
            },

            packagingType: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            servings: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            servingSize: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            costPrice: {
                type: DataTypes.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0,
            },

            sellingPrice: {
                type: DataTypes.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0,
            },

            wholesalePrice: {
                type: DataTypes.DECIMAL(14, 2),
                allowNull: true,
            },

            minimumSellingPrice: {
                type: DataTypes.DECIMAL(14, 2),
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
            tableName: "productdetails",
            modelName: "productdetails",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return productdetails;
};
