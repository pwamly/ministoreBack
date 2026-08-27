"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("taxgroups", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4,
            },

            name: {
                type: Sequelize.STRING(150),
                allowNull: false,
                unique: true,
            },

            rate: {
                type: Sequelize.DECIMAL(5, 2),
                allowNull: false,
                defaultValue: 0,
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
        await queryInterface.dropTable("taxgroups");
    },
};
