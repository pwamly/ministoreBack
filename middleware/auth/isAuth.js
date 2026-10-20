"use strict";

import jwt from "jsonwebtoken";

import config from "../../config/index.js";
import db from "../../models/index.js";
import { ROLES } from "../../config/permissions.js";
import { permissionsFor } from "../../services/auth.js";
import { subscriptionState } from "../../services/subscription.js";

const { verify } = jwt;

const deny = (res, status, message) => {
    res.statusMessage = message;

    return res.status(status).json({ successful: false, data: { message }, message });
};

/**
 * Authenticates the request and loads its tenant.
 *
 * Sets:
 *   req.user        min_user instance (fresh from DB)
 *   req.tenant      tenant (with plan), null for super admins
 *   req.tenantId    use this in EVERY query
 *   req.permissions effective permission list
 *   req.payload     legacy alias used by older routes
 *
 * 403 = token invalid/expired (frontend refreshes and retries)
 * 401 = session revoked or user disabled (frontend logs out)
 * 402 = store suspended or subscription expired
 */
export default async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header && header.split(" ")[1];

    if (!token) {
        return deny(res, 401, "No Authorization Header");
    }

    let payload;

    try {
        payload = verify(token, config.auth.accessTokenSecret);
    } catch {
        return deny(res, 403, "NOT HAVE ACCESS!");
    }

    try {
        const user = await db.min_user.findByPk(payload.id, {
            include: [
                {
                    model: db.tenant,
                    as: "tenant",
                    required: false,
                    include: [{ model: db.plan, as: "plan" }],
                },
            ],
        });

        // token_version changes on logout / forced sign-out.
        if (
            !user ||
            user.status !== "active" ||
            (user.token_version ?? 0) !== (payload.token_version ?? 0)
        ) {
            return deny(res, 401, "Session has ended. Please log in again.");
        }

        const isSuperAdmin = user.userRole === ROLES.SUPER_ADMIN;
        const tenant = user.tenant || null;

        if (!isSuperAdmin) {
            const state = subscriptionState(tenant);

            if (!state.ok) {
                return res.status(402).json({
                    successful: false,
                    code: "SUBSCRIPTION_INACTIVE",
                    message: state.reason,
                });
            }
        }

        req.user = user;
        req.tenant = tenant;
        req.tenantId = isSuperAdmin ? null : user.tenantId;
        req.permissions = permissionsFor(user, tenant);
        req.payload = {
            id: user.id,
            tenantId: user.tenantId,
            userRole: user.userRole,
        };

        return next();
    } catch (error) {
        return next(error);
    }
};
