"use strict";

import { compare } from "bcrypt";

import { assertUserIsUnique } from "../services/tenantSetup.js";
import { handler, cleanString, badRequest } from "../utils/http.js";

/**
 * Logged-in user edits their own profile. Role, tenant and
 * status cannot be changed here.
 */
export default handler(async (req, res) => {
    const user = req.user;

    const changes = {
        first_name: cleanString(req.body.firstname ?? req.body.first_name) ?? user.first_name,
        last_name: cleanString(req.body.lastname ?? req.body.last_name) ?? user.last_name,
        email: cleanString(req.body.email) ?? user.email,
        username: cleanString(req.body.username) ?? user.username,
        phone: cleanString(req.body.phone) ?? user.phone,
        signature: cleanString(req.body.signature) ?? user.signature,
    };

    await assertUserIsUnique(changes, undefined, user.id);

    const { password, currentPassword } = req.body;

    if (password) {
        const ok = Boolean(currentPassword) && (await compare(String(currentPassword), user.password));

        if (!ok) {
            throw badRequest("Current password is incorrect");
        }

        if (String(password).length < 6) {
            throw badRequest("Password must be at least 6 characters");
        }

        changes.password = password;
    }

    await user.update(changes);

    return res.json({ successful: true, success: true });
});

