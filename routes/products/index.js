"use strict";

import { Router } from "express";
import register from "./registerProduct.js";
const action = Router();

action.post("/registerProduct", register);
action.put("/editvehicle/:id", editvehicle);
action.delete("/deletevehicle/:id", async(req, res) => {
    res.json({});
});

action.post("/bulkdeletevehicle/", async(req, res) => {
    res.json({});
});

export default action;