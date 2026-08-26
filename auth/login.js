"use strict";

import db from "../models/index.js";

const { min_user } = db;

export default async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('trrrrrrrrrrrrrrr',username,password)

        console.log("LOGIN MODEL:", min_user.name);
        console.log(
            "LOGIN validateAndGet:",
            typeof min_user.validateAndGet
        );

        const result = await min_user.validateAndGet(
            username,
            password
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: result,
        });
    } catch (error) {
        console.error(
            ">>>>>>>>>>>>>>>>>>>>>>>>",
            error
        );

        return res.status(401).json({
            success: false,
            message: error.message || "Login failed",
        });
    }
};
