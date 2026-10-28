"use strict";

import { Router } from "express";

import auth_route from "../auth/index.js";
import isAuth from "../middleware/auth/isAuth.js";
import routes from "../routes/index.js";
import webhooks from "../routes/webhooks/index.js";

const controller = Router();

controller.use("/auth", auth_route);
controller.use("/webhooks", webhooks);
controller.use("/api", isAuth, routes);

export default controller;
