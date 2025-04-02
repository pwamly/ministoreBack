"use strict";

import { Router } from "express";
import isAdmin from "../middleware/auth/isAdmin.js";
import profile from "./profile/index.js";
import users from "./users/index.js";
import actions from "./actions/index.js";
import reports from "./reports/index.js";
const api = Router();

api.use("/profile", profile);
api.use("/team", isAdmin, users);
api.use("/profile", users);
api.use("/reports", reports);
api.use("/inspect", users);
api.use("/actions", actions);
api.use("/users", users);
export default api;