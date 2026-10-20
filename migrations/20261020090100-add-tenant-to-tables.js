"use strict";

// Adds tenantId to every business table, moves existing rows
// to the default tenant and turns global unique keys (SKU,
// barcode, invoice number, names) into per-tenant unique keys.

// Tables whose rows always belong to a tenant.
const TENANT_TABLES = [
    "products",
    "productdetails",
    "productbarcodes",
    "productregulatory",
    "inventory",
    "suppliers",
    "sales",
    "salesItems",
    "loanPayments",
];

// Lookup tables: tenantId NULL = shared with every tenant.
const SHARED_LOOKUP_TABLES = ["categories", "brands", "units", "taxgroups"];

// Global unique column -> becomes unique per tenant.
const PER_TENANT_UNIQUE = [
    ["products", "sku"],
    ["productbarcodes", "barcode"],
    ["sales", "invoiceNumber"],
    ["categories", "name"],
    ["brands", "name"],
    ["units", "name"],
    ["taxgroups", "name"],
];

const EXTRA_INDEXES = [
    ["sales", ["tenantId", "createdAt"]],
    ["sales", ["tenantId", "paymentMethod"]],
    ["loanPayments", ["tenantId", "paidAt"]],
    ["salesItems", ["tenantId", "productId"]],
    ["suppliers", ["tenantId", "name"]],
    ["inventory", ["tenantId"]],
    ["productdetails", ["tenantId"]],
    ["productregulatory", ["tenantId"]],
];

/** Drop single-column unique indexes on `column`, whatever their name. */
const dropUniqueOn = async (queryInterface, table, column) => {
    const indexes = await queryInterface.showIndex(table);

    for (const index of indexes) {
        const fields = (index.fields || []).map((field) => field.attribute);

        if (
            index.unique &&
            !index.primary &&
            fields.length === 1 &&
            fields[0] === column
        ) {
            await queryInterface.removeIndex(table, index.name);
        }
    }
};

const fkName = (table) => `${table}_tenant_fk`;

export default {
    async up(queryInterface, Sequelize) {
        const [tenants] = await queryInterface.sequelize.query(
            "SELECT id FROM tenants WHERE slug = 'main-store' LIMIT 1"
        );

        const defaultTenantId = tenants[0]?.id || null;

        // -------------------------------------------------
        // tenantId columns
        // -------------------------------------------------

        for (const table of [...TENANT_TABLES, ...SHARED_LOOKUP_TABLES, "min_user"]) {
            await queryInterface.addColumn(table, "tenantId", {
                type: Sequelize.UUID,
                allowNull: true,
            });
        }

        // Existing rows belong to the default tenant. Lookup rows
        // (categories, units, ...) stay NULL = shared defaults.
        if (defaultTenantId) {
            for (const table of [...TENANT_TABLES, "min_user"]) {
                await queryInterface.sequelize.query(
                    `UPDATE \`${table}\` SET tenantId = :tenantId WHERE tenantId IS NULL`,
                    { replacements: { tenantId: defaultTenantId } }
                );
            }
        }

        for (const table of TENANT_TABLES) {
            await queryInterface.changeColumn(table, "tenantId", {
                type: Sequelize.UUID,
                allowNull: false,
            });
        }

        for (const table of [...TENANT_TABLES, ...SHARED_LOOKUP_TABLES, "min_user"]) {
            await queryInterface.addConstraint(table, {
                fields: ["tenantId"],
                type: "foreign key",
                name: fkName(table),
                references: {
                    table: "tenants",
                    field: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            });
        }

        // -------------------------------------------------
        // Unique keys per tenant
        // -------------------------------------------------

        for (const [table, column] of PER_TENANT_UNIQUE) {
            await dropUniqueOn(queryInterface, table, column);

            await queryInterface.addIndex(table, ["tenantId", column], {
                unique: true,
                name: `${table}_tenant_${column}_unique`,
            });
        }

        for (const [table, fields] of EXTRA_INDEXES) {
            await queryInterface.addIndex(table, fields, {
                name: `${table}_${fields.join("_")}_idx`,
            });
        }

        // -------------------------------------------------
        // Users: status + roles
        // -------------------------------------------------

        await queryInterface.addColumn("min_user", "status", {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: "active",
        });

        await queryInterface.sequelize.query(
            "UPDATE min_user SET token_version = 0 WHERE token_version IS NULL"
        );

        // Old roles: admin -> owner, everything else -> cashier
        // (least privilege).
        await queryInterface.sequelize.query(
            "UPDATE min_user SET userRole = 'owner' WHERE userRole = 'admin'"
        );

        await queryInterface.sequelize.query(
            "UPDATE min_user SET userRole = 'cashier' WHERE userRole IS NULL OR userRole NOT IN ('owner', 'manager', 'cashier', 'super_admin')"
        );

        // A single-user install: that user is the owner.
        if (defaultTenantId) {
            const [users] = await queryInterface.sequelize.query(
                "SELECT id, userRole FROM min_user WHERE tenantId = :tenantId",
                { replacements: { tenantId: defaultTenantId } }
            );

            const hasOwner = users.some((user) => user.userRole === "owner");

            if (!hasOwner && users.length === 1) {
                await queryInterface.sequelize.query(
                    "UPDATE min_user SET userRole = 'owner' WHERE id = :id",
                    { replacements: { id: users[0].id } }
                );
            } else if (!hasOwner && users.length > 1) {
                console.warn(
                    "\n[migration] No owner in the default tenant. Promote one with:\n" +
                        "  npm run user:role -- <username> owner\n"
                );
            }
        }
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("min_user", "status");

        // Foreign keys first: MySQL will not drop an index a FK uses.
        for (const table of [...TENANT_TABLES, ...SHARED_LOOKUP_TABLES, "min_user"]) {
            await queryInterface.removeConstraint(table, fkName(table));
        }

        for (const [table, fields] of EXTRA_INDEXES) {
            await queryInterface.removeIndex(table, `${table}_${fields.join("_")}_idx`);
        }

        for (const [table, column] of PER_TENANT_UNIQUE) {
            await queryInterface.removeIndex(table, `${table}_tenant_${column}_unique`);

            // Fails if two tenants now share a value - expected.
            await queryInterface.addIndex(table, [column], {
                unique: true,
                name: column,
            });
        }

        for (const table of [...TENANT_TABLES, ...SHARED_LOOKUP_TABLES, "min_user"]) {
            // MySQL keeps an auto-created index for the dropped FK.
            const indexes = await queryInterface.showIndex(table);

            for (const index of indexes) {
                const fields = (index.fields || []).map((field) => field.attribute);

                if (fields.length === 1 && fields[0] === "tenantId") {
                    await queryInterface.removeIndex(table, index.name);
                }
            }

            await queryInterface.removeColumn(table, "tenantId");
        }

        await queryInterface.sequelize.query(
            "UPDATE min_user SET userRole = 'admin' WHERE userRole = 'owner'"
        );

        await queryInterface.sequelize.query(
            "UPDATE min_user SET userRole = 'user' WHERE userRole <> 'admin'"
        );
    },
};
