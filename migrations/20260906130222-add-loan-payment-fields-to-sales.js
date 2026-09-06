"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn(
            "sales",
            "customerMobile",
            {
                type: Sequelize.STRING(30),
                allowNull: true,
            }
        );

        await queryInterface.addColumn(
            "sales",
            "paidNow",
            {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
            }
        );
    },

    async down(queryInterface) {
        await queryInterface.removeColumn(
            "sales",
            "paidNow"
        );

        await queryInterface.removeColumn(
            "sales",
            "customerMobile"
        );
    },
};
