"use strict";

import { Op } from "sequelize";  // Import 'Op' from sequelize using ES module synta
import { v4 as uuidv4 } from "uuid";
import min_user  from "../models/min_user.js";


export default async(req, res) => {
    const { id } = req.payload;
    try {
        const {
            firstname: first_name,
            lastname: last_name,
            email,
            username,
            phone,
            signature,
        } = req.body;
        const bodyPayload = {
            first_name,
            last_name,
            email,
            username,
            phone,
            signature,
        };

        const updated = await min_user.update({...bodyPayload }, { where: { id } });

        if (updated == 1) {
            console.log("user created", updated, id);
            return res.json({ success: true });
        }

        return res.json({ success: false });
    } catch (error) {
        console.log("error", error);
    }
};