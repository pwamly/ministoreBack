"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const unit = sequelize.define(
        "unit",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                unique: true,
                primaryKey: true,
            },

            name: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true,
            },

            abbreviation: {
                type: DataTypes.STRING(20),
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
            tableName: "units",
            modelName: "unit",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return unit;
};
