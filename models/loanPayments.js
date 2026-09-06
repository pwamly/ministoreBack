"use strict";

export default (sequelize, DataTypes) => {
    const loanPayments = sequelize.define(
        "loanPayments",
        {
            // =================================================
            // PRIMARY KEY
            // =================================================

            id: {
                type: DataTypes.UUID,
                allowNull: false,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            // =================================================
            // SALE
            // =================================================
            //
            // References:
            // sales.id
            //
            saleId: {
                type: DataTypes.UUID,
                allowNull: false,
            },

            // =================================================
            // AMOUNT PAID
            // =================================================

            amount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
                validate: {
                    isDecimal: true,
                    min: 0.01,
                },
            },

            // =================================================
            // PAYMENT METHOD
            // =================================================
            //
            // cash
            // card
            // mobile
            // bank
            //
            paymentMethod: {
                type: DataTypes.STRING(30),
                allowNull: false,
                defaultValue: "cash",
            },

            // =================================================
            // USER WHO RECEIVED THE PAYMENT
            // =================================================
            //
            // min_user.id is CHAR(36)
            //
            userId: {
                type: DataTypes.CHAR(36),
                allowNull: false,
            },

            // =================================================
            // OPTIONAL NOTE
            // =================================================

            note: {
                type: DataTypes.STRING(500),
                allowNull: true,
            },

            // =================================================
            // PAYMENT DATE
            // =================================================

            paidAt: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },

            // =================================================
            // TIMESTAMPS
            // =================================================

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
            tableName: "loanPayments",
            modelName: "loanPayments",
            timestamps: true,
            underscored: false,
        }
    );

    // =========================================================
    // ASSOCIATIONS
    // =========================================================

    loanPayments.associate = (models) => {
        // -----------------------------------------------------
        // Payment belongs to the sale
        // -----------------------------------------------------

        loanPayments.belongsTo(
            models.sales,
            {
                foreignKey: "saleId",
                targetKey: "id",
                as: "sale",
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            }
        );

        // -----------------------------------------------------
        // Payment was received by a user
        // -----------------------------------------------------

        loanPayments.belongsTo(
            models.min_user,
            {
                foreignKey: "userId",
                targetKey: "id",
                as: "user",
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            }
        );
    };

    return loanPayments;
};
