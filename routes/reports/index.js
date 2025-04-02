"use strict";

import { Router } from "express";
import { vehiclereports, vehiclehistory } from "../../models/index.js";
import allreports from "./allreports.js";
import history from "./history.js";
import dashboarddata from "./dashboarddata.js";
import isAdmin from "../../middleware/auth/isAdmin.js";
import reportByid from "./reportByid.js";
import inspectReport from "./inspectreport.js";
import paginator from "../../middleware/reports/paginator.js";

const reports = Router();

reports.get("/", paginator, allreports);
reports.put("/:id", reportByid);
reports.get("/inspect", paginator, inspectReport);
reports.get("/history", paginator, history);
reports.get("/dashboard", dashboarddata);
reports.delete("/deletevehicle/:id", isAdmin, async(req, res) => {
    const { id } = req.params;
    try {
        const response = await vehiclereports.destroy({ where: { id } });
        if (response == 1) {
            return res.json({
                successful: true,
                message: "Report Deleted!",
            });
        }
        return res.status(401).json({
            successful: false,
            message: "Alredy deleted!",
        });
    } catch (error) {
        console.log(error);
        return res.status(401).json({
            successful: false,
            message: "Failed!",
        });
    }
});
reports.delete("/deletehistory/:id", isAdmin, async(req, res) => {
    const { id } = req.params;
    try {
        const response = await vehiclehistory.destroy({ where: { id } });
        if (response == 1) {
            return res.json({
                successful: true,
                message: "History  Deleted!",
            });
        }
        return res.status(401).json({
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
export default reports;