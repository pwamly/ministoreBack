"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("productbarcodes", {
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

            barcode: {
                type: Sequelize.STRING(100),
                allowNull: false,
                unique: true,
            },

            barcodeType: {
                type: Sequelize.STRING(30),
                allowNull: false,
                defaultValue: "EAN-13",
            },

            isPrimary: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
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
        await queryInterface.dropTable("productbarcodes");
    },
};
