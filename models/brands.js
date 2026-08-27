"use strict";

export default (sequelize, DataTypes) => {

    const brand = sequelize.define(
        "brand",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            name: {
                type: DataTypes.STRING(150),
                allowNull: false,
                unique: true,
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
            tableName: "brands",
            modelName: "brand",
            timestamps: true,
            underscored: false,
        }
    );

    brand.associate = (models) => {

        brand.hasMany(
            models.product,
            {
                foreignKey: "brandId",
                sourceKey: "id",
                as: "products",
            }
        );

    };

    return brand;
};
