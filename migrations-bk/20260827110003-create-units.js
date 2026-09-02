"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("units", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            name: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true,
            },

            abbreviation: {
                type: Sequelize.STRING(20),
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
        await queryInterface.dropTable("units");
    },
};
