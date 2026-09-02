"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const productregulatory = sequelize.define(
        "productregulatory",
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
                unique: true,
            },

            manufacturer: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },

            countryOfOrigin: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            licenseNumber: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            allergens: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            storageInstructions: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            shelfLifeMonths: {
                type: DataTypes.INTEGER,
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
            tableName: "productregulatory",
            modelName: "productregulatory",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return productregulatory;
};
