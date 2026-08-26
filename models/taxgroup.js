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

            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
                unique: true,
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
