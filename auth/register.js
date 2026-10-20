"use strict";

import config from "../config/index.js";
import { createTenantWithOwner } from "../services/tenantSetup.js";
import {
    createAccessToken,
    createRefreshToken,
    sendRefreshToken,
    sessionProfile,
} from "../services/auth.js";
import { handler, HttpError } from "../utils/http.js";

/**
 * Public self-service signup: creates a new store on a free trial
 * plus its owner account, and logs the owner in.
 *
 * Disabled unless ALLOW_PUBLIC_SIGNUP=true. Staff accounts are
 * created by the owner from /api/users, never here.
 */
export default handler(async (req, res) => {
    if (!config.saas.allowPublicSignup) {
        throw new HttpError(403, "Self sign-up is disabled. Contact us to open a store account.");
    }

    const {
        storeName,
        storePhone,
        storeAddress,
        firstname,
        lastname,
        first_name = firstname,
        last_name = lastname,
        email,
        username,
        password,
        phone,
    } = req.body;

    const { tenant, user, plan } = await createTenantWithOwner({
        store: { name: storeName, phone: storePhone, address: storeAddress, email },
        owner: { first_name, last_name, email, username, password, phone },
        subscriptionStatus: "trial",
    });

    tenant.plan = plan;

    sendRefreshToken(res, await createRefreshToken(user));

    return res.status(201).json({
        successful: true,
        success: true,
        message: "Store created successfully",
        accessToken: createAccessToken(user),
        profile: sessionProfile(user, tenant),
    });
});
