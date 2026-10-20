"use strict";

import { Op } from "sequelize";
import { hash, compare } from "bcrypt";

import config from "../config/index.js";

export default (sequelize, DataTypes) => {
    const min_user = sequelize.define(
        "min_user",
        {
            id: {
                type: DataTypes.CHAR(36),
                allowNull: false,
                primaryKey: true,
                unique: true,
            },

            // NULL only for platform super admins
            tenantId: {
                type: DataTypes.UUID,
                allowNull: true,
            },

            first_name: {
                type: DataTypes.STRING(60),
                allowNull: false,
            },

            last_name: {
                type: DataTypes.STRING(60),
                allowNull: false,
            },

            username: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },

            email: {
                type: DataTypes.STRING(255),
                allowNull: false,
                unique: true,
            },

            phone: {
                type: DataTypes.STRING(255),
                allowNull: false,
                unique: true,
            },

            password: {
                type: DataTypes.STRING(128),
                allowNull: false,
            },

            refresh_token: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            token_version: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },

            recoveryCode: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            userRole: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: "cashier",
            },

            signature: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            // active | disabled
            status: {
                type: DataTypes.STRING(20),
                allowNull: false,
                defaultValue: "active",
            },
        },
        {
            tableName: "min_user",
            modelName: "min_user",
            underscored: false,
            timestamps: false,

            scopes: {
                withoutPassword: {
                    attributes: {
                        exclude: ["password", "refresh_token", "recoveryCode"],
                    },
                },
            },
        }
    );

    min_user.associate = (models) => {
        min_user.belongsTo(models.tenant, {
            foreignKey: "tenantId",
            targetKey: "id",
            as: "tenant",
        });
    };

    // =====================================================
    // INSTANCE METHOD
    // =====================================================

    min_user.prototype.getFullName = function () {
        return `${this.getDataValue("first_name")} ${this.getDataValue(
            "last_name"
        )}`;
    };

    // =====================================================
    // HASH PASSWORD ON CREATE
    // =====================================================

    min_user.beforeCreate(async (user) => {
        if (!user.password) {
            return;
        }

        try {
            user.password = await hash(
                user.password,
                config.auth.bcryptRounds
            );
        } catch (error) {
            console.error(
                "Password hashing error:",
                error
            );

            throw new Error(
                "Error hashing password"
            );
        }
    });

    // =====================================================
    // HASH PASSWORD ON UPDATE
    // =====================================================

    min_user.beforeUpdate(async (user) => {
        if (!user.changed("password")) {
            return;
        }

        try {
            user.password = await hash(
                user.password,
                config.auth.bcryptRounds
            );
        } catch (error) {
            console.error(
                "Password hashing error:",
                error
            );

            throw new Error(
                "Error hashing password"
            );
        }
    });

    // =====================================================
    // LOGIN
    // =====================================================
    //
    // Only checks credentials. Tokens are issued by
    // services/auth.js so login and refresh build the same payload.

    min_user.validateAndGet = async function (
        username,
        password
    ) {
        if (!username || !password) {
            throw new Error(
                "Username/email and password are required!"
            );
        }

        const user = await min_user.findOne({
            where: {
                [Op.or]: [
                    {
                        username,
                    },
                    {
                        email: username,
                    },
                ],
            },
        });

        // Same message for unknown user and wrong password so the
        // login form cannot be used to discover usernames.
        if (!user || !(await compare(password, user.password))) {
            throw new Error("Invalid username or password");
        }

        return user;
    };

    return min_user;
};
