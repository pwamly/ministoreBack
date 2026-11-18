"use strict";

// Month (1-12) the store's financial year starts in. Yearly money
// reports group by it. 1 = January (calendar year).

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("tenants", "financialYearStartMonth", {
            type: Sequelize.TINYINT,
            allowNull: false,
            defaultValue: 1,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn("tenants", "financialYearStartMonth");
    },
};
