"use strict";

import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import db from "../models/index.js";

const { min_user } = db;

export default async (req, res) => {
    try {
        const {
            firstname: first_name,
            lastname: last_name,
            email,
            username,
            password,
            phone,
            signature,
        } = req.body;

        /*
         * Validate required fields
         */
        if (
            !first_name ||
            !last_name ||
            !email ||
            !username ||
            !password ||
            !phone ||
            !signature
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required",
            });
        }

        /*
         * Check whether username or email already exists
         */
        const existingUser = await min_user.findOne({
            where: {
                [Op.or]: [
                    { username },
                    { email },
                ],
            },
        });

        if (existingUser) {
            return res.status(417).json({
                success: false,
                message: "Username or email already exists",
            });
        }

        /*
         * Create user
         *
         * Do NOT hash the password here.
         * Your min_user beforeCreate hook does that.
         */
        const bodyPayload = {
            id: uuidv4(),
            first_name,
            last_name,
            email,
            username,
            password,
            phone,
            signature,
            userRole: "user",
            token_version: 0,
        };

        const user = await min_user.create(bodyPayload);

        console.log("User created:", user.id);

        return res.status(201).json({
            success: true,
            message: "User created successfully",
            data: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                username: user.username,
                email: user.email,
                phone: user.phone,
                userRole: user.userRole,
            },
        });
    } catch (error) {
        console.error("Registration error:", error);

        /*
         * Handle Sequelize unique constraint errors
         */
        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({
                success: false,
                message: "Username, email, or phone already exists",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Failed to create user",
        });
    }
};
