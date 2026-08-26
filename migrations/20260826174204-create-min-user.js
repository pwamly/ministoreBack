"use strict";

export async function up(queryInterface, Sequelize) {
    await queryInterface.createTable("min_user", {
        id: {
            type: Sequelize.CHAR(36),
            allowNull: false,
            primaryKey: true,
            unique: true,
        },

        first_name: {
            type: Sequelize.STRING(60),
            allowNull: false,
        },

        last_name: {
            type: Sequelize.STRING(60),
            allowNull: false,
        },

        username: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
        },

        email: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
        },

        phone: {
            type: Sequelize.STRING(255),
            allowNull: false,
            unique: true,
        },

        password: {
            type: Sequelize.STRING(128),
            allowNull: false,
        },

        refresh_token: {
            type: Sequelize.TEXT,
            allowNull: true,
        },

        token_version: {
            type: Sequelize.INTEGER,
            allowNull: true,
        },

        recoveryCode: {
            type: Sequelize.TEXT,
            allowNull: true,
        },

        userRole: {
            type: Sequelize.STRING,
            allowNull: true,
        },

        signature: {
            type: Sequelize.STRING,
            allowNull: false,
        },
    });
}

export async function down(queryInterface) {
    await queryInterface.dropTable("min_user");
}
