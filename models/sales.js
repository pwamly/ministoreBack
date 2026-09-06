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

            // Required when paymentMethod = "loan"
            customerMobile: {
                type: DataTypes.STRING(30),
                allowNull: true,
            },

            userId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            // Allowed:
            // cash
            // card
            // mobile
            // loan
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

            // Full cost of the sale.
            // This remains the total even when the sale is a loan.
            total: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            // Amount paid at the time of the sale.
            //
            // Cash/Card/Mobile:
            // normally equal to total.
            //
            // Loan:
            // cashier can enter a partial amount.
            paidNow: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            // Used only for cash payments.
            cashGiven: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },

            // Used only for cash payments.
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
