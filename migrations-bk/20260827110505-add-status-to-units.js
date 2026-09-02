"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("units", "status", {
            type: Sequelize.STRING(30),
            allowNull: false,
            defaultValue: "active",
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("units", "status");
    },
};
