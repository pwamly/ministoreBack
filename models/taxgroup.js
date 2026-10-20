"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const taxgroup = sequelize.define(
        "taxgroup",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                unique: true,
                primaryKey: true,
            },

            // NULL = shared default visible to every tenant
            tenantId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },

            rate: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
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
            tableName: "taxgroups",
            modelName: "taxgroup",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return taxgroup;
};
