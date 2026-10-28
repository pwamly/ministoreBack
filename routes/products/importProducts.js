"use strict";

// =====================================================
// PRODUCT CSV IMPORT
// =====================================================
//
// POST /products/import   { csv: "<file text>", dryRun?: boolean }
//
// Columns (header names, any order, unknown columns ignored):
//   name*, price*, cost, stock, category, sku, barcode,
//   batch_number, expiry_date, manufacturer, unit_of_measure,
//   minimum_stock, is_active, supplier,
//   active_ingredient, dosage            -> appended to the description
//   prescription_required, is_controlled_substance,
//   is_weighable, last_restock_date      -> accepted but not stored
//
// Each row is imported in its own transaction, so one bad row
// is reported and skipped without undoing the others.
// Categories, units and suppliers are matched by name and
// created for this store when missing.

import { Router } from "express";
import { Op, fn, col, where as sqlWhere } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { createProduct } from "../../services/products.js";
import { csvToObjects } from "../../utils/csv.js";
import { handler, badRequest, isProvided, cleanString } from "../../utils/http.js";

const { sequelize, product, productbarcode, category, unit, supplier } = db;

const router = Router();

const MAX_ROWS = 2000;
const REQUIRED_COLUMNS = ["name", "price"];

const TRUE_VALUES = ["1", "true", "yes", "y", "ndiyo"];
const FALSE_VALUES = ["0", "false", "no", "n", "hapana"];

const parseBool = (value, fallback) => {
    const text = String(value || "").trim().toLowerCase();

    if (TRUE_VALUES.includes(text)) return true;
    if (FALSE_VALUES.includes(text)) return false;

    return fallback;
};

/** "1,500" / "TSh 1500" -> 1500. Empty -> null, garbage -> NaN. */
const parseNumber = (value) => {
    if (!isProvided(value)) return null;

    return Number(String(value).replace(/[^0-9.\-]/g, "") || NaN);
};

/** YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY -> YYYY-MM-DD. */
const parseDate = (value) => {
    const text = String(value || "").trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    let year, month, day;

    if (match) {
        [, year, month, day] = match;
    } else if ((match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
        [, day, month, year] = match;
    } else {
        return null;
    }

    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00Z`);

    // Rejects 31/02/2027 etc.
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
};

const skuFromName = (name) =>
    `SKU-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;

/** Find a lookup row by name (shared or this store's), or create it for this store. */
const findOrCreateByName = async (model, tenantId, name, extra, transaction) => {
    const found = await model.findOne({
        where: {
            [Op.and]: [
                { [Op.or]: [{ tenantId: null }, { tenantId }] },
                sqlWhere(fn("LOWER", col("name")), name.toLowerCase()),
            ],
        },
        transaction,
    });

    return found || model.create({ tenantId, name, ...extra }, { transaction });
};

const findOrCreateUnit = async (tenantId, name, transaction) => {
    const found = await unit.findOne({
        where: {
            [Op.and]: [
                { [Op.or]: [{ tenantId: null }, { tenantId }] },
                {
                    [Op.or]: [
                        sqlWhere(fn("LOWER", col("name")), name.toLowerCase()),
                        sqlWhere(fn("LOWER", col("abbreviation")), name.toLowerCase()),
                    ],
                },
            ],
        },
        transaction,
    });

    return found || unit.create({ tenantId, name: name.slice(0, 50), abbreviation: name.slice(0, 20) }, { transaction });
};

/** Validate one CSV row and turn it into createProduct data (lookups not resolved yet). */
const readRow = (row) => {
    const errors = [];
    const name = cleanString(row.name);
    const price = parseNumber(row.price);
    const cost = parseNumber(row.cost);
    const stock = parseNumber(row.stock);
    const minimumStock = parseNumber(row.minimum_stock);

    if (!name) errors.push("name is required");
    if (!(price > 0)) errors.push("price must be a number greater than 0");
    if (cost !== null && !(cost >= 0)) errors.push("cost must be 0 or more");
    if (stock !== null && !(stock >= 0)) errors.push("stock must be 0 or more");
    if (minimumStock !== null && !(minimumStock >= 0)) errors.push("minimum_stock must be 0 or more");

    const expiryDate = isProvided(row.expiry_date) ? parseDate(row.expiry_date) : null;

    if (isProvided(row.expiry_date) && !expiryDate) {
        errors.push("expiry_date must be YYYY-MM-DD or DD/MM/YYYY");
    }

    const notes = [
        isProvided(row.active_ingredient) && `Active ingredient: ${row.active_ingredient.trim()}`,
        isProvided(row.dosage) && `Usage: ${row.dosage.trim()}`,
    ].filter(Boolean);

    return {
        errors,
        data: {
            itemName: name,
            sku: cleanString(row.sku),
            barcode: cleanString(row.barcode),
            sellingPrice: price,
            costPrice: cost ?? 0,
            openingStock: stock ?? 0,
            reorderLevel: minimumStock ?? 0,
            batchNumber: cleanString(row.batch_number),
            expiryDate,
            manufacturer: cleanString(row.manufacturer),
            description: notes.length ? notes.join("\n") : null,
            status: parseBool(row.is_active, true) ? "active" : "inactive",
        },
        lookups: {
            category: cleanString(row.category),
            unit: cleanString(row.unit_of_measure),
            supplier: cleanString(row.supplier),
        },
    };
};

router.post(
    "/products/import",
    can(PERMISSIONS.PRODUCTS_MANAGE),
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const dryRun = req.body?.dryRun === true;
        const { columns, rows } = csvToObjects(req.body?.csv);

        const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));

        if (missing.length) {
            throw badRequest(`The file is missing the column(s): ${missing.join(", ")}`);
        }

        if (rows.length === 0) {
            throw badRequest("The file has no product rows");
        }

        if (rows.length > MAX_ROWS) {
            throw badRequest(`Import at most ${MAX_ROWS} products at a time (this file has ${rows.length})`);
        }

        const results = [];
        const seenSkus = new Set();
        const seenBarcodes = new Set();

        for (const [index, row] of rows.entries()) {
            // +2: header is line 1, and lines are 1-based.
            const line = index + 2;
            const { errors, data, lookups } = readRow(row);
            const result = { line, name: data.itemName || "", sku: data.sku };

            const generateSku = !data.sku && data.itemName;

            if (data.sku && seenSkus.has(data.sku.toLowerCase())) {
                errors.push(`SKU ${data.sku} appears more than once in the file`);
            }

            if (data.barcode && seenBarcodes.has(data.barcode)) {
                errors.push(`barcode ${data.barcode} appears more than once in the file`);
            }

            if (data.sku) seenSkus.add(data.sku.toLowerCase());
            if (data.barcode) seenBarcodes.add(data.barcode);

            if (!errors.length && data.sku && (await product.findOne({ where: { tenantId, sku: data.sku } }))) {
                errors.push(`SKU ${data.sku} already exists in the store`);
            }

            // No SKU to compare: match by name so re-uploading a file doesn't duplicate products.
            if (
                !errors.length &&
                generateSku &&
                (await product.findOne({
                    where: {
                        tenantId,
                        status: { [Op.ne]: "removed" },
                        [Op.and]: [sqlWhere(fn("LOWER", col("itemName")), data.itemName.toLowerCase())],
                    },
                }))
            ) {
                errors.push(`a product named "${data.itemName}" already exists in the store`);
            }

            if (!errors.length && data.barcode && (await productbarcode.findOne({ where: { tenantId, barcode: data.barcode } }))) {
                errors.push(`barcode ${data.barcode} already belongs to another product`);
            }

            if (errors.length) {
                results.push({ ...result, status: "error", message: errors.join("; ") });
                continue;
            }

            if (dryRun) {
                results.push({ ...result, status: "ok" });
                continue;
            }

            try {
                const created = await sequelize.transaction(async (transaction) => {
                    if (generateSku) {
                        const base = skuFromName(data.itemName);
                        let sku = base;
                        let suffix = 2;

                        while (await product.findOne({ where: { tenantId, sku }, transaction })) {
                            sku = `${base}-${suffix}`;
                            suffix += 1;
                        }

                        data.sku = sku;
                    }

                    if (lookups.category) {
                        data.categoryId = (await findOrCreateByName(category, tenantId, lookups.category.slice(0, 150), {}, transaction)).id;
                    }

                    if (lookups.unit) {
                        data.unitId = (await findOrCreateUnit(tenantId, lookups.unit, transaction)).id;
                    }

                    if (lookups.supplier) {
                        data.supplierId = (
                            await findOrCreateByName(supplier, tenantId, lookups.supplier.slice(0, 200), { status: "active" }, transaction)
                        ).id;
                    }

                    return createProduct({ tenant: req.tenant, userId: req.user.id, data, transaction });
                });

                results.push({ ...result, sku: created.sku, status: "created", productId: created.id });
            } catch (error) {
                if (!error.status) {
                    console.error(`Product import line ${line} failed:`, error);
                }

                results.push({
                    ...result,
                    status: "error",
                    message: error.status ? error.message : "Could not save this row",
                });

                // Plan limit reached: the remaining rows would all fail the same way.
                if (error.extra?.code === "PLAN_LIMIT") {
                    break;
                }
            }
        }

        const count = (status) => results.filter((item) => item.status === status).length;

        return res.json({
            successful: true,
            dryRun,
            message: dryRun
                ? `${count("ok")} of ${rows.length} rows are ready to import`
                : `Imported ${count("created")} of ${rows.length} products`,
            summary: { total: rows.length, ok: count("ok"), created: count("created"), errors: count("error") },
            results,
        });
    })
);

export default router;
