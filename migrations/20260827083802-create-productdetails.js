"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("productdetails", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            productId: {
                type: Sequelize.UUID,
                allowNull: false,

                references: {
                    model: "products",
                    key: "id",
                },

                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },

            flavor: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            size: {
                type: Sequelize.STRING(50),
                allowNull: true,
            },

            netWeight: {
                type: Sequelize.DECIMAL(12, 3),
                allowNull: true,
            },

            weightUnit: {
                type: Sequelize.STRING(30),
                allowNull: true,
            },

            packagingType: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            servings: {
                type: Sequelize.INTEGER,
                allowNull: true,
            },

            servingSize: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            costPrice: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0,
            },

            sellingPrice: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: false,
                defaultValue: 0,
            },

            wholesalePrice: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: true,
            },

            minimumSellingPrice: {
                type: Sequelize.DECIMAL(14, 2),
                allowNull: true,
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
        await queryInterface.dropTable("productdetails");
    },
};
