"use strict";

import { Router } from "express";
import editvehicle from "./editvehicle.js";
import register from "./register.js";
const action = Router();

action.post("/registervehicle", register);
action.put("/editvehicle/:id", editvehicle);
action.delete("/deletevehicle/:id", async(req, res) => {
    res.json({});
});

action.post("/bulkdeletevehicle/", async(req, res) => {
    res.json({});
});

export default action;