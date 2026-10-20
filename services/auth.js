"use strict";

import jwt from "jsonwebtoken";

import config from "../config/index.js";
import { effectivePermissions, ROLES } from "../config/permissions.js";
import { subscriptionState } from "./subscription.js";

const { sign } = jwt;

/** Modules switched on by the tenant's plan. */
export const tenantModules = (tenant) => tenant?.plan?.modules || [];

export const permissionsFor = (user, tenant) =>
    effectivePermissions(
        user.userRole,
        user.userRole === ROLES.SUPER_ADMIN ? [] : tenantModules(tenant)
    );

/**
 * Access token payload. Kept small: role and permissions are
 * re-read from the database on every request (middleware/auth/isAuth.js),
 * so changing a user's role or disabling them takes effect immediately.
 */
const accessPayload = (user) => ({
    id: user.id,
    tenantId: user.tenantId,
    token_version: user.token_version ?? 0,
});

export const createAccessToken = (user) =>
    sign(accessPayload(user), config.auth.accessTokenSecret, {
        expiresIn: config.auth.accessTokenTtl,
    });

export const createRefreshToken = async (user) => {
    const refresh_token = sign(
        { id: user.id, token_version: user.token_version ?? 0 },
        config.auth.refreshTokenSecret,
        { expiresIn: config.auth.refreshTokenTtl }
    );

    await user.update({ refresh_token });

    return refresh_token;
};

const cookieOptions = () => {
    const { secure, sameSite, domain, path } = config.auth.cookie;

    return {
        httpOnly: true,
        secure,
        sameSite,
        path,
        ...(domain ? { domain } : {}),
    };
};

export const sendRefreshToken = (res, token) => {
    res.cookie(config.auth.cookie.name, token, cookieOptions());
};

export const clearRefreshToken = (res) => {
    res.clearCookie(config.auth.cookie.name, cookieOptions());
};

/** What the frontend gets after login/refresh/me. */
export const sessionProfile = (user, tenant) => {
    const subscription = tenant ? subscriptionState(tenant) : null;

    return {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        userRole: user.userRole,
        permissions: permissionsFor(user, tenant),
        tenant: tenant
            ? {
                  id: tenant.id,
                  name: tenant.name,
                  currency: tenant.currency,
                  allowNegativeStock: tenant.allowNegativeStock,
                  plan: tenant.plan
                      ? {
                            code: tenant.plan.code,
                            name: tenant.plan.name,
                            modules: tenant.plan.modules,
                        }
                      : null,
                  subscriptionStatus: tenant.subscriptionStatus,
                  subscriptionExpiresAt: subscription?.expiresAt || null,
              }
            : null,
    };
};
