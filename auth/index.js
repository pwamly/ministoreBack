"use strict";

import { Router } from "express";

import isAuth from "../middleware/auth/isAuth.js";
import { sessionProfile } from "../services/auth.js";
import register from "./register.js";
import editprofile from "./editprofile.js";
import login from "./login.js";
import logout from "./logout.js";
import resetPassword from "./resetPassword.js";
import forgotPassword from "./forgotPassword.js";

const auth_route = Router();

auth_route.post("/login", login);
auth_route.post("/logout", logout);

// New store + owner (only when ALLOW_PUBLIC_SIGNUP=true).
// Staff users are created by the owner via POST /api/users.
auth_route.post("/register", register);

auth_route.get("/me", isAuth, (req, res) =>
    res.json({ successful: true, profile: sessionProfile(req.user, req.tenant) })
);
auth_route.put("/profile", isAuth, editprofile);
auth_route.post("/forgot-password", forgotPassword);
auth_route.post("/reset-password", resetPassword);

export default auth_route;
