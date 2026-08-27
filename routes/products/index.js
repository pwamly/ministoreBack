"use strict";

import { Router } from "express";
import register from "./registerProduct.js";
import paginator from "./../../middleware/reports/paginator.js";
import products from "./getProducts.js";
const action = Router();




action.delete("/deletevehicle/:id", async(req, res) => {
    res.json({});
});

action.post("/bulkdeletevehicle/", async(req, res) => {
    res.json({});
});

export default action;