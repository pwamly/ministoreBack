"use strict";
require("dotenv").config();

export default (res, refresh_token) => {
    res.cookie("jto", refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" ? true : false,
    });
};