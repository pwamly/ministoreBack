"use strict";

// =====================================================
// READ-ONLY DATABASE CHECK (run before migrating)
// =====================================================
//
//   npm run db:check            read-only report
//   npm run db:baseline         same check; if the original schema is
//                               complete, records the 17 original
//                               migrations as applied (SequelizeMeta)
//                               so db:migrate only runs the new ones
//
// Shows which database the current APP_ENV points at, which
// migrations are recorded, and whether the schema already matches
// the original 17 migrations.

import Sequelize from "sequelize";

import env from "../config/env.cjs";
import databases from "../config/database.cjs";

const cfg = databases[env.APP_ENV];
const sequelize = new Sequelize.Sequelize(cfg.database, cfg.username, cfg.password, { ...cfg, logging: false });

// What the original migrations (up to 20260906145854) create.
const EXPECTED = {
    products: ["id", "sku", "itemName", "brandId", "categoryId", "unitId", "taxGroupId", "status"],
    categories: ["id", "name", "parentId", "status"],
    inventory: ["id", "productId", "quantity", "reorderLevel"],
    suppliers: ["id", "name", "phone"],
    min_user: ["id", "username", "email", "phone", "password", "token_version", "userRole", "signature"],
    productbarcodes: ["id", "productId", "barcode", "isPrimary"],
    productdetails: ["id", "productId", "costPrice", "sellingPrice"],
    productregulatory: ["id", "productId"],
    brands: ["id", "name"],
    units: ["id", "name", "status"],
    taxgroups: ["id", "name", "rate"],
    sales: ["id", "invoiceNumber", "userId", "paymentMethod", "total", "customerMobile", "paidNow"],
    salesItems: ["id", "saleId", "productId", "quantity", "unitPrice", "costPrice", "subtotal", "profit"],
    loanPayments: ["id", "saleId", "amount", "userId", "paidAt"],
};

const ORIGINAL_MIGRATIONS = [
    "20260826172927-create-products.js",
    "20260826173210-create-categories.js",
    "20260826173444-create-inventory.js",
    "20260826173528-create-suppliers.js",
    "20260826174204-create-min-user.js",
    "20260827083643-create-productbarcodes.js",
    "20260827083802-create-productdetails.js",
    "20260827084433-create-productregulatory.js",
    "20260827104514-create-brands.js",
    "20260827110003-create-units.js",
    "20260827110343-create-taxgroups.js",
    "20260827110505-add-status-to-units.js",
    "20260904110106-create-sales.js",
    "20260904110426-create-sales-items.js",
    "20260904114043-add-profit-to-sales-items.js",
    "20260906130222-add-loan-payment-fields-to-sales.js",
    "20260906145854-create-loan-payments.js",
];

const BASELINE = process.argv.includes("--baseline");

// Tables that only exist after the new migrations.
const NEW_TABLES = ["tenants", "plans", "stockMovements", "expenses", "unregisteredItems", "catalogItems"];

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: Sequelize.QueryTypes.SELECT });

try {
    console.log(`APP_ENV  : ${env.APP_ENV}`);
    console.log(`Database : ${cfg.database} on ${cfg.host}:${cfg.port} as ${cfg.username}`);

    await sequelize.authenticate();

    const [{ version }] = await q("SELECT VERSION() AS version");
    console.log(`Server   : ${version}\n`);

    const tables = (await q("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()")).map(
        (row) => row.name
    );

    console.log(`Tables (${tables.length}): ${tables.sort().join(", ") || "(none)"}\n`);

    if (tables.includes("SequelizeMeta")) {
        const applied = await q("SELECT name FROM SequelizeMeta ORDER BY name");
        console.log(`SequelizeMeta has ${applied.length} entries${applied.length ? ":" : ""}`);
        applied.forEach((row) => console.log(`  ${row.name}`));
    } else {
        console.log("SequelizeMeta table: MISSING (schema was not created by migrations)");
    }

    console.log("\nOriginal schema check:");

    let complete = true;

    for (const [table, columns] of Object.entries(EXPECTED)) {
        if (!tables.includes(table)) {
            console.log(`  ✗ ${table}: table missing`);
            complete = false;
            continue;
        }

        const present = (await q("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table", { table })).map(
            (row) => row.name
        );
        const missing = columns.filter((column) => !present.includes(column));

        if (missing.length) {
            complete = false;
            console.log(`  ✗ ${table}: missing columns ${missing.join(", ")}`);
        } else {
            const [{ count }] = await q(`SELECT COUNT(*) AS count FROM \`${table}\``);
            console.log(`  ✓ ${table} (${count} rows)`);
        }
    }

    const alreadyNew = NEW_TABLES.filter((table) => tables.includes(table));

    console.log("");

    if (alreadyNew.length) {
        console.log(`New-version tables already present: ${alreadyNew.join(", ")} — send this output before doing anything.`);
    } else if (tables.length === 0) {
        console.log("RESULT: database is EMPTY. Check PROD_DB_NAME / PROD_DB_HOST — this is probably not your shop's database.");
    } else if (complete && BASELINE) {
        await sequelize.query("CREATE TABLE IF NOT EXISTS SequelizeMeta (name VARCHAR(255) NOT NULL PRIMARY KEY) ENGINE=InnoDB");

        for (const name of ORIGINAL_MIGRATIONS) {
            await sequelize.query("INSERT IGNORE INTO SequelizeMeta (name) VALUES (:name)", { replacements: { name } });
        }

        console.log(`BASELINE DONE: recorded the ${ORIGINAL_MIGRATIONS.length} original migrations as applied. Next: npm run db:migrate:status, then npm run db:migrate.`);
    } else if (complete) {
        console.log("RESULT: original schema is complete. Safe next step: npm run db:baseline, then npm run db:migrate.");
    } else {
        console.log("RESULT: original schema is INCOMPLETE. Do not migrate — send this output.");
    }
} catch (error) {
    console.error(`Could not check the database: ${error.message}`);
    process.exitCode = 1;
} finally {
    await sequelize.close();
}
