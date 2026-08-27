"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("products", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            sku: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true,
            },

            itemName: {
                type: Sequelize.STRING(200),
                allowNull: false,
            },

            productName: {
                type: Sequelize.STRING(200),
                allowNull: true,
            },

            description: {
                type: Sequelize.TEXT,
                allowNull: true,
            },

            productType: {
                type: Sequelize.STRING(150),
                allowNull: true,
            },

            brandId: {
                type: Sequelize.UUID,
                allowNull: true,
            },

            categoryId: {
                type: Sequelize.UUID,
                allowNull: true,
            },

            unitId: {
                type: Sequelize.UUID,
                allowNull: true,
            },

            taxGroupId: {
                type: Sequelize.UUID,
                allowNull: true,
            },

            status: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "active",
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
        await queryInterface.dropTable("products");
    },
};
