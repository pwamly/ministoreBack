"use strict";

import { Op } from "sequelize";
import dotenv from "dotenv";
import { hash, compare } from "bcrypt";
import jwt from "jsonwebtoken";

import createRefreshToken from "../auth/createRefreshToken.js";

dotenv.config();

const { sign } = jwt;

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
                defaultValue: "user",
            },

            signature: {
                type: DataTypes.STRING,
                allowNull: false,
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
                        exclude: ["password"],
                    },
                },
            },
        }
    );

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
                12
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
                12
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

    min_user.validateAndGet = async function (
        username,
        password
    ) {
        if (!username || !password) {
            throw new Error(
                "Username/email and password are required!"
            );
        }

        // -------------------------------------------------
        // Find user
        // -------------------------------------------------

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

            raw: true,
        });

        if (!user) {
            throw new Error(
                "Account does not exist!"
            );
        }

        // -------------------------------------------------
        // Check password
        // -------------------------------------------------

        const passwordMatch =
            await compare(
                password,
                user.password
            );

        if (!passwordMatch) {
            throw new Error(
                "Wrong password!"
            );
        }

        // -------------------------------------------------
        // Profile
        // -------------------------------------------------

        const profile = {
            id: user.id,

            first_name:
                user.first_name,

            last_name:
                user.last_name,

            username:
                user.username,

            email:
                user.email,

            userRole:
                user.userRole,

            phone:
                user.phone,
        };

        // -------------------------------------------------
        // Access token secret
        // -------------------------------------------------

        if (
            !process.env
                .ACCESSTOKEN_SECRETE
        ) {
            throw new Error(
                "ACCESSTOKEN_SECRETE is not configured"
            );
        }

        // -------------------------------------------------
        // Create access token
        // -------------------------------------------------

        const access_token =
            sign(
                profile,
                process.env
                    .ACCESSTOKEN_SECRETE,
                {
                    expiresIn: "30m",
                }
            );

        // -------------------------------------------------
        // Create refresh token
        // -------------------------------------------------

        const refresh_token =
            await createRefreshToken(
                {
                    id: user.id,

                    token_version:
                        user.token_version ??
                        0,
                },

                min_user
            );

        if (!refresh_token) {
            throw new Error(
                "Failed to create refresh token"
            );
        }

        // -------------------------------------------------
        // Return internally
        // -------------------------------------------------

        return {
            profile,
            access_token
        };
    };

    return min_user;
};
