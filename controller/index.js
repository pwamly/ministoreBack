"use strict";
import { Router } from "express";
import auth_route from "../auth/index.js";
import isAuth from "../middleware/auth/isAuth.js";
import routes from "../routes/index.js";

const controller = Router();

controller.use("/auth", auth_route);
controller.use("/api", isAuth, routes);

module.exports = controller;