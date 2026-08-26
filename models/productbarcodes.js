"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const productbarcode = sequelize.define(
        "productbarcode",
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

            barcode: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: true,
            },

            barcodeType: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "EAN-13",
            },

            isPrimary: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: true,
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
            tableName: "productbarcodes",
            modelName: "productbarcode",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return productbarcode;
};
