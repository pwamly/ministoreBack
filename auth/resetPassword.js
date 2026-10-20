"use strict";

import jwt from "jsonwebtoken";

import config from "../config/index.js";
import db from "../models/index.js";

const { verify } = jwt;
const { min_user } = db;

export default async (req, res) => {
    const { email, code, newpassword: password } = req.body;

    if (!email || !code || !password) {
        return res.status(400).json({
            successful: false,
            message: "Email, code and new password are required",
        });
    }

    if (String(password).length < 6) {
        return res.status(400).json({
            successful: false,
            message: "Password must be at least 6 characters",
        });
    }

    try {
        const user = await min_user.findOne({ where: { email } });

        if (!user || !user.recoveryCode) {
            return res.status(401).json({ successful: false, message: "Incorrect code!" });
        }

        let payload;

        try {
            payload = verify(user.recoveryCode, config.auth.recoverySecret);
        } catch (error) {
            const expired = error.name === "TokenExpiredError";

            return res.status(401).json({
                successful: false,
                message: expired ? "Your code has expired" : "Incorrect code!",
            });
        }

        if (String(payload.code) !== String(code).trim() || payload.id !== user.id) {
            return res.status(401).json({ successful: false, message: "Incorrect code!" });
        }

        // Instance update -> beforeUpdate hook hashes the password.
        // Bumping token_version signs out every existing session.
        await user.update({
            password,
            recoveryCode: null,
            token_version: (user.token_version ?? 0) + 1,
        });

        return res.status(200).json({ successful: true, message: "password updated" });
    } catch (error) {
        console.error("RESET PASSWORD ERROR:", error);

        return res.status(500).json({ successful: false, message: "Something went wrong" });
    }
};
