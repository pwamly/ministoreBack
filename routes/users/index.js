"use strict";

// =====================================================
// STORE USERS (owner only)
// =====================================================
//
// GET  /users              staff of this store
// POST /users              add staff (owner | manager | cashier)
// PUT  /users/:id          edit, change role, disable, reset password
// POST /users/:id/logout   sign the user out everywhere

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS, ROLES, TENANT_ROLES, effectivePermissions } from "../../config/permissions.js";
import { tenantModules } from "../../services/auth.js";
import { assertUserIsUnique, validateNewUser } from "../../services/tenantSetup.js";
import { handler, badRequest, notFound, HttpError, cleanString } from "../../utils/http.js";

const { min_user } = db;

const router = Router();

router.use("/users", can(PERMISSIONS.USERS_MANAGE));

const formatUser = (user, tenant) => ({
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    userRole: user.userRole,
    status: user.status,
    permissions: effectivePermissions(user.userRole, tenantModules(tenant)),
});

const findUser = async (req) => {
    const user = await min_user.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });

    if (!user) {
        throw notFound("User not found");
    }

    return user;
};

const assertRole = (role) => {
    if (!TENANT_ROLES.includes(role)) {
        throw badRequest(`Role must be one of: ${TENANT_ROLES.join(", ")}`);
    }
};

const activeOwners = (tenantId) =>
    min_user.count({ where: { tenantId, userRole: ROLES.OWNER, status: "active" } });

router.get(
    "/users",
    handler(async (req, res) => {
        const users = await min_user.findAll({
            where: { tenantId: req.tenantId },
            order: [
                ["status", "ASC"],
                ["first_name", "ASC"],
            ],
        });

        return res.json({
            successful: true,
            data: users.map((user) => formatUser(user, req.tenant)),
            roles: TENANT_ROLES,
            limits: { maxUsers: req.tenant?.plan?.maxUsers ?? null },
        });
    })
);

router.post(
    "/users",
    handler(async (req, res) => {
        const body = {
            first_name: cleanString(req.body.first_name ?? req.body.firstname),
            last_name: cleanString(req.body.last_name ?? req.body.lastname),
            username: cleanString(req.body.username),
            email: cleanString(req.body.email),
            phone: cleanString(req.body.phone),
            password: req.body.password,
        };
        const role = req.body.userRole || ROLES.CASHIER;

        validateNewUser(body);
        assertRole(role);

        const maxUsers = req.tenant?.plan?.maxUsers;

        if (maxUsers) {
            const activeUsers = await min_user.count({ where: { tenantId: req.tenantId, status: "active" } });

            if (activeUsers >= maxUsers) {
                throw new HttpError(403, `Your plan allows ${maxUsers} active users. Upgrade to add more.`, {
                    code: "PLAN_LIMIT",
                });
            }
        }

        await assertUserIsUnique(body);

        const user = await min_user.create({
            ...body,
            id: uuidv4(),
            tenantId: req.tenantId,
            userRole: role,
            status: "active",
            signature: cleanString(req.body.signature) || `${body.first_name} ${body.last_name}`,
            token_version: 0,
        });

        return res.status(201).json({ successful: true, message: "User created", data: formatUser(user, req.tenant) });
    })
);

router.put(
    "/users/:id",
    handler(async (req, res) => {
        const user = await findUser(req);
        const isSelf = user.id === req.user.id;
        const changes = {};
        let signOut = false;

        for (const field of ["first_name", "last_name", "username", "email", "phone"]) {
            if (req.body[field] !== undefined) {
                changes[field] = cleanString(req.body[field]);

                if (!changes[field]) {
                    throw badRequest(`${field.replace("_", " ")} cannot be empty`);
                }
            }
        }

        if (req.body.userRole !== undefined && req.body.userRole !== user.userRole) {
            assertRole(req.body.userRole);

            if (isSelf) {
                throw badRequest("You cannot change your own role");
            }

            if (user.userRole === ROLES.OWNER && (await activeOwners(req.tenantId)) <= 1) {
                throw badRequest("The store needs at least one owner");
            }

            changes.userRole = req.body.userRole;
            signOut = true;
        }

        if (req.body.status !== undefined && req.body.status !== user.status) {
            if (!["active", "disabled"].includes(req.body.status)) {
                throw badRequest("status must be active or disabled");
            }

            if (isSelf) {
                throw badRequest("You cannot disable your own account");
            }

            if (req.body.status === "disabled" && user.userRole === ROLES.OWNER && (await activeOwners(req.tenantId)) <= 1) {
                throw badRequest("The store needs at least one active owner");
            }

            changes.status = req.body.status;
            signOut = true;
        }

        if (req.body.password) {
            if (String(req.body.password).length < 6) {
                throw badRequest("Password must be at least 6 characters");
            }

            changes.password = req.body.password;
            signOut = !isSelf;
        }

        await assertUserIsUnique(
            {
                username: changes.username ?? user.username,
                email: changes.email ?? user.email,
                phone: changes.phone ?? user.phone,
            },
            undefined,
            user.id
        );

        if (signOut) {
            changes.token_version = (user.token_version ?? 0) + 1;
        }

        await user.update(changes);

        return res.json({ successful: true, message: "User updated", data: formatUser(user, req.tenant) });
    })
);

router.post(
    "/users/:id/logout",
    handler(async (req, res) => {
        const user = await findUser(req);

        await user.update({ token_version: (user.token_version ?? 0) + 1, refresh_token: null });

        return res.json({ successful: true, message: "User signed out on all devices" });
    })
);

export default router;
