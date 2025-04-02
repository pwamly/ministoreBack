"use strict";

import nb_user  from "../models/nb_user.js";
import sendRefreshToken from "./sendRefreshToken.js";

export default async(req, res) => {
    try {
        const { username, password } = req.body;
        const Token = await nb_user.validateAndGet(username, password);
        const { access_token, refresh_token } = Token;
        sendRefreshToken(res, refresh_token);

        return res.json({ success: true, accessToken: access_token });
    } catch (error) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>',error)
        return res.status(401).json({ successful: false });
    }
};