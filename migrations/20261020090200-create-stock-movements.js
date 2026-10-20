"use strict";

// Every change to inventory.quantity writes one row here, so
// stock levels can always be explained (who, when, why).

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("stockMovements", {
            id: {
                type: Sequelize.UUID,
                allowNull: false,
                primaryKey: true,
            },
            tenantId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: "tenants",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
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
            // opening | purchase | sale | adjustment | return | damage
            type: {
                type: Sequelize.STRING(30),
                allowNull: false,
            },
            // Signed: + adds stock, - removes stock
            quantity: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
            },
            balanceAfter: {
                type: Sequelize.DECIMAL(15, 3),
                allowNull: false,
            },
            unitCost: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: true,
            },
            // e.g. "sale" + sales.id
            referenceType: {
                type: Sequelize.STRING(30),
                allowNull: true,
            },
            referenceId: {
                type: Sequelize.UUID,
                allowNull: true,
            },
            supplierId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: "suppliers",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            note: {
                type: Sequelize.STRING(500),
                allowNull: true,
            },
            userId: {
                type: Sequelize.CHAR(36),
                allowNull: false,
                references: {
                    model: "min_user",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
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

        await queryInterface.addIndex("stockMovements", ["tenantId", "createdAt"], {
            name: "stock_movements_tenant_created_idx",
        });

        await queryInterface.addIndex("stockMovements", ["tenantId", "productId", "createdAt"], {
            name: "stock_movements_tenant_product_idx",
        });

        await queryInterface.addIndex("stockMovements", ["referenceType", "referenceId"], {
            name: "stock_movements_reference_idx",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("stockMovements");
    },
};
