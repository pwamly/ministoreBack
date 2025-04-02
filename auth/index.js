"use strict";

import { Router } from "express";
import dotenv from "dotenv";  // ES Module import
import isAdmin from "../middleware/auth/isAdmin.js";
import isAuth from "../middleware/auth/isAuth.js";
import register from "./register.js";
import editprofile from "./editprofile.js";
import login from "./login.js";
import logout from "./logout.js";
import revokeRefreshToken from "./revokeRefreshToken.js";
import resetPassword from "./resetPassword.js";
import forgotPassword from "./forgotPassword.js";

dotenv.config();

const auth_route = Router();
auth_route.post("/login", login);
auth_route.post("/logout", logout);
auth_route.post("/register", isAuth, isAdmin, register);
auth_route.put("/profile", isAuth, editprofile);
auth_route.post("/revokeAccount", isAdmin, revokeRefreshToken);
auth_route.post("/forgot-password", forgotPassword);
auth_route.post("/reset-password", resetPassword);

export default auth_route;