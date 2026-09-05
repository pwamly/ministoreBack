"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("salesItems", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

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

            productId: {
                type: Sequelize.UUID,
                allowNull: false,

                references: {
                    model: "products",
                    key: "id",
                },

                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            },

            sku: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            barcode: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },

            productName: {
                type: Sequelize.STRING(255),
                allowNull: false,
            },

            quantity: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
            },

            unitPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
            },

            costPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },

            subtotal: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
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
        await queryInterface.dropTable("salesItems");
    },
};
