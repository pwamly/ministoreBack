"use strict";

export default (sequelize, DataTypes) => {
    const expense = sequelize.define(
        "expense",
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

            categoryId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },

            // YYYY-MM-DD, the day the money was spent
            expenseDate: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },

            // cash | card | mobile | bank
            paymentMethod: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "cash",
            },

            payee: {
                type: DataTypes.STRING(150),
                allowNull: true,
            },

            reference: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },

            description: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },

            // Who recorded it
            userId: {
                type: DataTypes.CHAR(36),
                allowNull: false,
            },
        },
        {
            tableName: "expenses",
            modelName: "expense",
            timestamps: true,
            underscored: false,
        }
    );

    expense.associate = (models) => {
        expense.belongsTo(models.expenseCategory, {
            foreignKey: "categoryId",
            targetKey: "id",
            as: "category",
        });

        expense.belongsTo(models.min_user, {
            foreignKey: "userId",
            targetKey: "id",
            as: "user",
        });
    };

    return expense;
};
