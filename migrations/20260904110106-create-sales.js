"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("sales", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            invoiceNumber: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true,
            },

            customerName: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },

            userId: {
                type: Sequelize.UUID,
                allowNull: false,
            },

            paymentMethod: {
                type: Sequelize.STRING(30),
                allowNull: false,
            },

            subtotal: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            tax: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            total: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            cashGiven: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },

            changeAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            },

            status: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "completed",
            },

            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },

            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn("NOW"),
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("sales");
    },
};
