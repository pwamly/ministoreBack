"use strict";

export default (sequelize, DataTypes) => {
    const sales = sequelize.define(
        "sales",
        {
            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            invoiceNumber: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: true,
            },

            customerName: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },

            userId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            paymentMethod: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "cash",
            },

            subtotal: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            tax: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            total: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            cashGiven: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            changeAmount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            status: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "completed",
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
            tableName: "sales",
            modelName: "sales",
            timestamps: true,
            underscored: false,
        }
    );

    sales.associate = (models) => {
        sales.hasMany(
            models.salesItems,
            {
                foreignKey: "saleId",
                sourceKey: "id",
                as: "items",
            }
        );

        sales.belongsTo(
            models.min_user,
            {
                foreignKey: "userId",
                targetKey: "id",
                as: "user",
            }
        );
    };

    return sales;
};
