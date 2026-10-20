"use strict";

// =====================================================
// ADMIN CLI
// =====================================================
//
//   npm run tenant:create -- --store "Mama Shop" --plan business \
//       --first Asha --last Juma --username asha --email asha@x.com \
//       --phone 0712000000 --password secret123 [--active]
//
//   npm run user:role -- <username> <owner|manager|cashier|super_admin>
//
//   npm run superadmin:create -- --first Jane --last Doe --username jane \
//       --email jane@x.com --phone 0700000000 --password secret123
//
// Uses the database of the current APP_ENV.

import { v4 as uuidv4 } from "uuid";

import db from "../models/index.js";
import { ROLES } from "../config/permissions.js";
import { createTenantWithOwner, assertUserIsUnique, validateNewUser } from "../services/tenantSetup.js";

const [command, ...rest] = process.argv.slice(2);

const flags = {};
const positional = [];

for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith("--")) {
        const key = rest[i].slice(2);
        const next = rest[i + 1];

        if (next === undefined || next.startsWith("--")) {
            flags[key] = true;
        } else {
            flags[key] = next;
            i += 1;
        }
    } else {
        positional.push(rest[i]);
    }
}

const ownerFromFlags = () => ({
    first_name: flags.first,
    last_name: flags.last,
    username: flags.username,
    email: flags.email,
    phone: flags.phone,
    password: flags.password,
});

const commands = {
    async "tenant:create"() {
        const { tenant, user, plan } = await createTenantWithOwner({
            store: { name: flags.store, phone: flags["store-phone"], address: flags.address },
            owner: ownerFromFlags(),
            planCode: flags.plan,
            subscriptionStatus: flags.active ? "active" : "trial",
        });

        console.log(`Created store "${tenant.name}" (${tenant.id}) on plan ${plan.code}`);
        console.log(`Owner login: ${user.username}`);
    },

    async "user:role"() {
        const [username, role] = positional;

        if (!username || !Object.values(ROLES).includes(role)) {
            throw new Error(`Usage: npm run user:role -- <username> <${Object.values(ROLES).join("|")}>`);
        }

        const user = await db.min_user.findOne({ where: { username } });

        if (!user) {
            throw new Error(`No user "${username}"`);
        }

        await user.update({ userRole: role, token_version: (user.token_version ?? 0) + 1 });

        console.log(`${username} is now ${role} (signed out of existing sessions)`);
    },

    async "superadmin:create"() {
        const owner = ownerFromFlags();

        validateNewUser(owner);
        await assertUserIsUnique(owner);

        await db.min_user.create({
            ...owner,
            id: uuidv4(),
            tenantId: null,
            userRole: ROLES.SUPER_ADMIN,
            status: "active",
            signature: `${owner.first_name} ${owner.last_name}`,
            token_version: 0,
        });

        console.log(`Super admin ${owner.username} created`);
    },
};

try {
    if (!commands[command]) {
        throw new Error(`Unknown command "${command}". Use one of: ${Object.keys(commands).join(", ")}`);
    }

    await commands[command]();
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    await db.sequelize.close();
}
