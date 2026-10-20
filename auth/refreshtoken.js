"use strict";

import jwt from "jsonwebtoken";

import config from "../config/index.js";
import db from "../models/index.js";
import {
    createAccessToken,
    createRefreshToken,
    sendRefreshToken,
    clearRefreshToken,
    sessionProfile,
} from "../services/auth.js";

const { verify } = jwt;
const { min_user, tenant: Tenant, plan: Plan } = db;

const reject = (res) => {
    clearRefreshToken(res);

    return res.status(401).json({ successful: false, AccessToken: "" });
};

export default async (req, res) => {
    const token = req.cookies?.[config.auth.cookie.name];

    if (!token) {
        return reject(res);
    }

    let payload;

    try {
        payload = verify(token, config.auth.refreshTokenSecret);
    } catch {
        return reject(res);
    }

    try {
        const user = await min_user.findByPk(payload.id);

        if (
            !user ||
            user.status !== "active" ||
            (user.token_version ?? 0) !== (payload.token_version ?? 0)
        ) {
            return reject(res);
        }

        const tenant = user.tenantId
            ? await Tenant.findByPk(user.tenantId, { include: [{ model: Plan, as: "plan" }] })
            : null;

        sendRefreshToken(res, await createRefreshToken(user));

        // Role and permissions come from the DB, so a refreshed
        // session always reflects the user's current role.
        return res.status(200).json({
            successful: true,
            AccessToken: createAccessToken(user),
            profile: sessionProfile(user, tenant),
        });
    } catch (error) {
        console.error("REFRESH ERROR:", error);

        return res.status(500).json({ successful: false, AccessToken: "" });
    }
};
