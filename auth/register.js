"use strict";

import { Op } from "sequelize";  // Import 'Op' from sequelize using ES module syntax
import { v4 as uuidv4 } from "uuid";
import min_user from "../models/min_user.js";  // Import min_user model

export default async(req, res) => {
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
        };

        const [user, created] = await min_user.findOrCreate({
            where: {
                [Op.or]: { username, email },
            },
            defaults: bodyPayload,
        });
        if (created) {
            console.log("user created");
            return res.json({ success: created });
        }
        if (user) {
            console.log("user already exist", user);
            return res.status(417).json({ data: { message: "user already exist" } });
        }
        return res.json({ success: created });
    } catch (error) {
        console.log("error", error);
    }
};