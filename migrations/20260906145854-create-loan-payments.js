"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable(
            "loanPayments",
            {
                id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    defaultValue:
                        Sequelize.UUIDV4,
                    primaryKey: true,
                },

                // =================================================
                // SALE
                // =================================================
                //
                // sales.id is UUID, so this MUST also be UUID.
                //
                saleId: {
                    type: Sequelize.UUID,
                    allowNull: false,

                    references: {
                        model: "sales",
                        key: "id",
                    },

                    onUpdate: "CASCADE",
                    onDelete: "CASCADE",
                },

                // =================================================
                // AMOUNT PAID
                // =================================================

                amount: {
                    type: Sequelize.DECIMAL(
                        15,
                        2
                    ),
                    allowNull: false,
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
                    type: Sequelize.STRING(30),
                    allowNull: false,
                    defaultValue: "cash",
                },

                // =================================================
                // USER WHO RECEIVED THE PAYMENT
                // =================================================
                //
                // min_user.id is CHAR(36), NOT UUID.
                //
                userId: {
                    type: Sequelize.CHAR(36),
                    allowNull: false,

                    references: {
                        model: "min_user",
                        key: "id",
                    },

                    onUpdate: "CASCADE",
                    onDelete: "RESTRICT",
                },

                // =================================================
                // OPTIONAL NOTE
                // =================================================

                note: {
                    type: Sequelize.STRING(500),
                    allowNull: true,
                },

                // =================================================
                // PAYMENT DATE
                // =================================================

                paidAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue:
                        Sequelize.NOW,
                },

                // =================================================
                // TIMESTAMPS
                // =================================================

                createdAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue:
                        Sequelize.NOW,
                },

                updatedAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue:
                        Sequelize.NOW,
                },
            }
        );

        // =====================================================
        // INDEXES
        // =====================================================

        await queryInterface.addIndex(
            "loanPayments",
            ["saleId"],
            {
                name:
                    "loan_payments_sale_id_idx",
            }
        );

        await queryInterface.addIndex(
            "loanPayments",
            ["userId"],
            {
                name:
                    "loan_payments_user_id_idx",
            }
        );

        await queryInterface.addIndex(
            "loanPayments",
            ["paidAt"],
            {
                name:
                    "loan_payments_paid_at_idx",
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.dropTable(
            "loanPayments"
        );
    },
};
