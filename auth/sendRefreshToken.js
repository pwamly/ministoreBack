"use strict";
import dotenv from "dotenv";  // ES Module import
dotenv.config();  // Load environment variables from .env file

export default (res, refresh_token) => {
    res.cookie("jto", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" ? true : false,
    });
};