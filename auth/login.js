"use strict";

import db from "../models/index.js";
import { ROLES } from "../config/permissions.js";
import {
    createAccessToken,
    createRefreshToken,
    sendRefreshToken,
    sessionProfile,
} from "../services/auth.js";
import { subscriptionState } from "../services/subscription.js";

const { min_user, tenant: Tenant, plan: Plan } = db;

export default async (req, res) => {
    try {
        const { username, password } = req.body;

        let user;

        try {
            user = await min_user.validateAndGet(username, password);
        } catch (error) {
            return res.status(401).json({
                successful: false,
                success: false,
                message: error.message || "Login failed",
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                successful: false,
                success: false,
                message: "This account has been disabled. Contact your store owner.",
            });
        }

        const tenant = user.tenantId
            ? await Tenant.findByPk(user.tenantId, {
                  include: [{ model: Plan, as: "plan" }],
              })
            : null;

        let billingRequired = null;

        if (user.userRole !== ROLES.SUPER_ADMIN) {
            const state = subscriptionState(tenant);

            // The owner of an unpaid store signs in to pay; the API
            // only lets them reach /api/billing until they do.
            if (!state.ok && state.renewable && user.userRole === ROLES.OWNER) {
                billingRequired = { code: "SUBSCRIPTION_INACTIVE", message: state.reason };
            } else if (!state.ok) {
                return res.status(402).json({
                    successful: false,
                    success: false,
                    code: "SUBSCRIPTION_INACTIVE",
                    message: state.reason,
                });
            }
        }

        sendRefreshToken(res, await createRefreshToken(user));

        return res.status(200).json({
            successful: true,
            success: true,
            message: "Login successful",
            accessToken: createAccessToken(user),
            profile: sessionProfile(user, tenant),
            billingRequired,
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            successful: false,
            success: false,
            message: "Login failed",
        });
    }
};
