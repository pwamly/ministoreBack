"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("productregulatory", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            productId: {
                type: Sequelize.UUID,
                allowNull: false,
                unique: true,

                references: {
                    model: "products",
                    key: "id",
                },

                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },

            manufacturer: {
                type: Sequelize.STRING(200),
                allowNull: true,
            },

            countryOfOrigin: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            licenseNumber: {
                type: Sequelize.STRING(100),
                allowNull: true,
            },

            allergens: {
                type: Sequelize.TEXT,
                allowNull: true,
            },

            storageInstructions: {
                type: Sequelize.TEXT,
                allowNull: true,
            },

            shelfLifeMonths: {
                type: Sequelize.INTEGER,
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
        await queryInterface.dropTable("productregulatory");
    },
};
