"use strict";

import jwt from "jsonwebtoken";

import config from "../config/index.js";
import db from "../models/index.js";
import { clearRefreshToken } from "../services/auth.js";

const { verify } = jwt;
const { min_user } = db;

/**
 * Ends every session of the user: bumping token_version
 * invalidates all their access and refresh tokens.
 *
 * Accepts the access token in the body (`token`) or the
 * Authorization header; an expired token is still accepted
 * here so logout always works.
 */
export default async (req, res) => {
    const header = req.headers.authorization;
    const token = req.body?.token || (header && header.split(" ")[1]);

    clearRefreshToken(res);

    if (!token) {
        return res.status(200).json({ successful: true });
    }

    try {
        const payload = verify(token, config.auth.accessTokenSecret, { ignoreExpiration: true });

        const user = await min_user.findByPk(payload.id);

        if (user && (user.token_version ?? 0) === (payload.token_version ?? 0)) {
            await user.update({
                token_version: (user.token_version ?? 0) + 1,
                refresh_token: null,
            });
        }
    } catch (error) {
        // Invalid token: nothing to revoke, the cookie is already cleared.
    }

    return res.status(200).json({ successful: true });
};
