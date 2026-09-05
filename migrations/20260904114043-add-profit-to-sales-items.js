"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            "salesItems",
            "profit",
            {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn(
            "salesItems",
            "profit"
        );
    },
};
