"use strict";

export default (sequelize, DataTypes) => {
    const supplier = sequelize.define(
        "supplier",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            tenantId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            name: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },

            contactPerson: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            phone: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },

            email: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            address: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },

            city: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            taxNumber: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            notes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            // active | inactive
            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },
        },
        {
            tableName: "suppliers",
            modelName: "supplier",
            timestamps: true,
            underscored: false,
        }
    );

    return supplier;
};
