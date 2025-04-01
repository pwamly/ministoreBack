"use strict";

import { nb_user } from "../models/index.js";
import sendRefreshToken from "./sendRefreshToken.js";

module.exports = async(req, res) => {
    try {
        const { username, password } = req.body;
        const Token = await nb_user.validateAndGet(username, password);
        const { access_token, refresh_token } = Token;
        sendRefreshToken(res, refresh_token);

        return res.json({ success: true, accessToken: access_token });
    } catch (error) {
        return res.status(401).json({ successful: false });
    }
};