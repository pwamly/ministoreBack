"use strict";

import { Op } from "sequelize";
import dotenv from "dotenv";
import { hash, compare } from "bcrypt";
import pkg from "jsonwebtoken";
import createRefreshToken from "../auth/createRefreshToken.js";

dotenv.config();

const { sign } = pkg;

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
                allowNull: true,
                defaultValue: 0,
            },

            recoveryCode: {
                type: DataTypes.TEXT,
                allowNull: true,
            },

            userRole: {
                type: DataTypes.STRING,
                allowNull: true,
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

    /*
     * Instance method
     */
    min_user.prototype.getFullName = function () {
        return `${this.getDataValue("first_name")} ${this.getDataValue(
            "last_name"
        )}`;
    };

    /*
     * Hash password before creating user
     */
    min_user.beforeCreate(async (user) => {
        try {
            if (user.password) {
                user.password = await hash(user.password, 12);
            }
        } catch (error) {
            console.error("Password hashing error:", error);
            throw new Error("Error hashing password");
        }
    });

    /*
     * Hash password if it is changed
     */
    min_user.beforeUpdate(async (user) => {
        try {
            if (user.changed("password")) {
                user.password = await hash(user.password, 12);
            }
        } catch (error) {
            console.error("Password hashing error:", error);
            throw new Error("Error hashing password");
        }
    });

    /*
     * Static login method
     */
    min_user.validateAndGet = async function (username, password) {
        try {
            if (!username || !password) {
                throw new Error("Username/email and password are required!");
            }

            /*
             * Find user using either username or email
             */
            const user = await min_user.findOne({
                where: {
                    [Op.or]: [
                        {
                            username: username,
                        },
                        {
                            email: username,
                        },
                    ],
                },
                raw: true,
            });

            if (!user) {
                throw new Error("Account does not exist!");
            }

            /*
             * Compare password
             */
            const match = await compare(password, user.password);

            if (!match) {
                throw new Error("Wrong password!");
            }

            /*
             * Get required user information
             */
            const {
                id,
                first_name,
                last_name,
                username: userUsername,
                email,
                token_version,
                userRole,
                phone,
            } = user;

            /*
             * User profile returned to client
             */
            const profile = {
                id,
                first_name,
                last_name,
                username: userUsername,
                email,
                userRole,
                phone,
            };

            /*
             * Check JWT secret
             */
            if (!process.env.ACCESSTOKEN_SECRETE) {
                throw new Error(
                    "ACCESSTOKEN_SECRETE is not configured in .env"
                );
            }

            /*
             * Create access token
             */
            const access_token = sign(
                profile,
                process.env.ACCESSTOKEN_SECRETE,
                {
                    expiresIn: "15h",
                }
            );

            /*
             * Create refresh token
             */
            const refresh_token = await createRefreshToken(
                {
                    id,
                    token_version: token_version ?? 0,
                },
                min_user
            );

            if (!refresh_token) {
                throw new Error("Failed to create refresh token");
            }

            /*
             * Return login result
             */
            return {
                profile,
                access_token,
                refresh_token,
            };
        } catch (error) {
            console.error("validateAndGet error:", error);
            throw error;
        }
    };

    return min_user;
};
