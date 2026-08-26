"use strict";

import min_user  from "../models/min_user.js";
import {} from "./revokeRefreshToken.js";
import pkg from 'jsonwebtoken';
const { verify } = pkg;

export default async(req, res) => {
    const { token } = req.body;
    try {
        const payload = verify(token, process.env.ACCESSTOKEN_SECRETE);
        const { id } = payload;

        let { token_version } = await min_user.findOne({ where: { id: id } });
        const user = await min_user.update({ token_version: token_version + 1 }, { where: { id: id } });
        if (user) {
            return res.status(200).json({ successful: true });
        }
    } catch (error) {
        console.log(error);
        return res.status(401).json({ successful: false });
    }
};