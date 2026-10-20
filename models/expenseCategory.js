"use strict";

export default (sequelize, DataTypes) => {
    const expenseCategory = sequelize.define(
        "expenseCategory",
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
                type: DataTypes.STRING(100),
                allowNull: false,
            },

            description: {
                type: DataTypes.STRING(255),
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
            tableName: "expenseCategories",
            modelName: "expenseCategory",
            timestamps: true,
            underscored: false,
        }
    );

    expenseCategory.associate = (models) => {
        expenseCategory.hasMany(models.expense, {
            foreignKey: "categoryId",
            sourceKey: "id",
            as: "expenses",
        });
    };

    return expenseCategory;
};
