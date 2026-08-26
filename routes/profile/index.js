"use strict";

import { Router } from "express";
import min_user  from "../../models/min_user.js";

const profile = Router();

profile.get("/:id", async(req, res) => {
    const { id } = req.params;

    const data = await min_user.findOne({ where: { id } });
    const {
        first_name: fname,
        last_name: lname,
        username,
        email,
        signature,
        userRole,
        phone,
    } = data;

    res.json({ fname, lname, username, email, signature, userRole, phone });
});

export default profile;