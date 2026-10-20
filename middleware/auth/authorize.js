"use strict";

/**
 * Route guard: the user must hold ALL listed permissions.
 *
 *   api.get("/expenses", can(PERMISSIONS.EXPENSES_VIEW), listExpenses)
 *
 * Permissions already exclude modules missing from the tenant's
 * plan, so this also enforces the subscription plan.
 */
export const can =
    (...required) =>
    (req, res, next) => {
        const granted = req.permissions || [];
        const missing = required.filter((permission) => !granted.includes(permission));

        if (missing.length === 0) {
            return next();
        }

        return res.status(403).json({
            successful: false,
            code: "FORBIDDEN",
            message: "You do not have permission to do this.",
            missing,
        });
    };

/** True if the request's user holds `permission`. */
export const has = (req, permission) => (req.permissions || []).includes(permission);

/** Requests that act on store data need a tenant (not a platform admin). */
export const requireTenant = (req, res, next) => {
    if (req.tenantId) {
        return next();
    }

    return res.status(403).json({
        successful: false,
        code: "TENANT_REQUIRED",
        message: "This action is only available inside a store account.",
    });
};
