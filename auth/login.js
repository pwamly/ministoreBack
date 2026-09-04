"use strict";

import db from "../models/index.js";
import sendRefreshToken from "./sendRefreshToken.js";

const { min_user } = db;

export default async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("LOGIN:", username);

    const result = await min_user.validateAndGet(username, password);


    const { access_token, refresh_token } = result;

    // IMPORTANT: send HttpOnly refresh-token cookie

    sendRefreshToken(res, refresh_token);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken: access_token,
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(401).json({
      success: false,
      message: "Login failed",
    });
  }
};
