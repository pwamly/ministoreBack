"use strict";

import dotenv from "dotenv";

dotenv.config();

export default (sequelize, DataTypes) => {
    const category = sequelize.define(
        "category",
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
            },

            parentId: {
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
            tableName: "categories",
            modelName: "category",
            underscored: false,
            timestamps: true,
            scopes: {},
        }
    );

    return category;
};
