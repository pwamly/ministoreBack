"use strict";

import { Router } from "express";
import getUsers from "./user.js";
import paginator from "../../middleware/reports/paginator.js";
import isAdmin from "../../middleware/auth/isAdmin.js";
import min_user  from "../../models/min_user.js";
const user = Router();

user.get("/", paginator, getUsers);

user.delete("/:id", isAdmin, async(req, res) => {
    const { id } = req.params;
    try {
        const response = await min_user.destroy({ where: { id } });
        if (response == 1) {
            return res.json({
                successful: true,
                message: "User Deleted!",
            });
        }
        return res.status(403).json({
            successful: false,
            message: "Alredy deleted!",
        });
    } catch (error) {
        console.log(error);
        return res.status(403).json({
            successful: false,
            message: "Failed!",
        });
    }
});

export default user;