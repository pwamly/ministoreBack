"use strict";

// =====================================================
// INVENTORY
// =====================================================
//
// GET  /inventory               stock list + summary
// GET  /inventory/movements     stock history (ledger)
// POST /inventory/stock-in      receive goods
// POST /inventory/adjust        stocktake / damage / return
// PUT  /inventory/:productId    reorder level, location, batch

import { Router } from "express";
import { Op, QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { applyStockChange } from "../../services/stock.js";
import { STOCK_MOVEMENT_TYPES } from "../../models/stockMovement.js";
import {
    handler,
    badRequest,
    notFound,
    cleanString,
    isProvided,
    isDateString,
    requireNumber,
    round2,
    pagination,
    paginationMeta,
} from "../../utils/http.js";

const { sequelize, product, productdetails, productbarcode, inventory, stockMovement, supplier, min_user } = db;

const router = Router();

const VIEW = can(PERMISSIONS.INVENTORY_VIEW);
const MANAGE = can(PERMISSIONS.INVENTORY_MANAGE);

/** Product of this tenant, or 404. */
const findProduct = async (tenantId, productId, transaction) => {
    if (!productId) {
        throw badRequest("productId is required");
    }

    const found = await product.findOne({
        where: { id: productId, tenantId },
        include: [{ model: productdetails, as: "details", required: false }],
        transaction,
    });

    if (!found) {
        throw notFound("Product not found");
    }

    return found;
};

const findSupplier = async (tenantId, supplierId, transaction) => {
    if (!supplierId) {
        return null;
    }

    const found = await supplier.findOne({ where: { id: supplierId, tenantId }, transaction });

    if (!found) {
        throw notFound("Supplier not found");
    }

    return found;
};

const stockStatus = (quantity, reorderLevel) => {
    if (quantity <= 0) {
        return "out";
    }

    if (quantity <= reorderLevel) {
        return "low";
    }

    return "in";
};

// =====================================================
// LIST
// =====================================================

router.get(
    "/inventory",
    VIEW,
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const { search, status, categoryId } = req.query;
        const page = pagination(req.query, { defaultLimit: 25 });

        const where = { tenantId };
        const and = [];

        if (isProvided(search)) {
            const term = String(search).trim();

            const barcodeMatches = await productbarcode.findAll({
                where: { tenantId, barcode: term },
                attributes: ["productId"],
                raw: true,
            });

            and.push({
                [Op.or]: [
                    { sku: { [Op.like]: `%${term}%` } },
                    { itemName: { [Op.like]: `%${term}%` } },
                    { productName: { [Op.like]: `%${term}%` } },
                    ...(barcodeMatches.length
                        ? [{ id: { [Op.in]: barcodeMatches.map((row) => row.productId) } }]
                        : []),
                ],
            });
        }

        if (isProvided(categoryId)) {
            where.categoryId = categoryId;
        }

        if (status === "out") {
            and.push({
                [Op.or]: [{ "$inventory.id$": null }, { "$inventory.quantity$": { [Op.lte]: 0 } }],
            });
        } else if (status === "low") {
            and.push({ "$inventory.quantity$": { [Op.gt]: 0 } });
            and.push(sequelize.where(sequelize.col("inventory.quantity"), Op.lte, sequelize.col("inventory.reorderLevel")));
        } else if (status === "in") {
            and.push(sequelize.where(sequelize.col("inventory.quantity"), Op.gt, sequelize.col("inventory.reorderLevel")));
            and.push({ "$inventory.quantity$": { [Op.gt]: 0 } });
        }

        if (and.length) {
            where[Op.and] = and;
        }

        const { rows, count } = await product.findAndCountAll({
            where,
            include: [
                { model: inventory, as: "inventory", required: false },
                {
                    model: productdetails,
                    as: "details",
                    required: false,
                    attributes: ["costPrice", "sellingPrice"],
                },
            ],
            order: [["itemName", "ASC"]],
            limit: page.limit,
            offset: page.offset,
            subQuery: false,
            distinct: true,
        });

        const data = rows.map((row) => {
            const quantity = Number(row.inventory?.quantity || 0);
            const reorderLevel = Number(row.inventory?.reorderLevel || 0);
            const costPrice = Number(row.details?.costPrice || 0);

            return {
                productId: row.id,
                sku: row.sku,
                itemName: row.itemName,
                productStatus: row.status,
                quantity,
                reorderLevel,
                reorderQuantity: Number(row.inventory?.reorderQuantity || 0),
                location: row.inventory?.location || null,
                batchNumber: row.inventory?.batchNumber || null,
                expiryDate: row.inventory?.expiryDate || null,
                costPrice,
                sellingPrice: Number(row.details?.sellingPrice || 0),
                stockValue: round2(Math.max(quantity, 0) * costPrice),
                stockStatus: stockStatus(quantity, reorderLevel),
                updatedAt: row.inventory?.updatedAt || null,
            };
        });

        const [summary] = await sequelize.query(
            `SELECT
                COUNT(*) AS totalProducts,
                COALESCE(SUM(CASE WHEN i.id IS NULL OR i.quantity <= 0 THEN 1 ELSE 0 END), 0) AS outOfStock,
                COALESCE(SUM(CASE WHEN i.quantity > 0 AND i.quantity <= i.reorderLevel THEN 1 ELSE 0 END), 0) AS lowStock,
                COALESCE(SUM(GREATEST(COALESCE(i.quantity, 0), 0) * COALESCE(d.costPrice, 0)), 0) AS stockValue,
                COALESCE(SUM(GREATEST(COALESCE(i.quantity, 0), 0) * COALESCE(d.sellingPrice, 0)), 0) AS retailValue
            FROM products p
            LEFT JOIN inventory i ON i.productId = p.id AND i.tenantId = p.tenantId
            LEFT JOIN productdetails d ON d.productId = p.id AND d.tenantId = p.tenantId
            WHERE p.tenantId = :tenantId AND p.status = 'active'`,
            { replacements: { tenantId }, type: QueryTypes.SELECT }
        );

        return res.json({
            successful: true,
            data,
            pagination: paginationMeta(page, count),
            summary: {
                totalProducts: Number(summary.totalProducts),
                outOfStock: Number(summary.outOfStock),
                lowStock: Number(summary.lowStock),
                stockValue: round2(summary.stockValue),
                retailValue: round2(summary.retailValue),
            },
        });
    })
);

// =====================================================
// MOVEMENTS
// =====================================================

router.get(
    "/inventory/movements",
    VIEW,
    handler(async (req, res) => {
        const { productId, type, startDate, endDate } = req.query;
        const page = pagination(req.query, { defaultLimit: 25 });

        const where = { tenantId: req.tenantId };

        if (isProvided(productId)) {
            where.productId = productId;
        }

        if (isProvided(type)) {
            where.type = type;
        }

        if (isDateString(startDate) || isDateString(endDate)) {
            where.createdAt = {
                ...(isDateString(startDate) ? { [Op.gte]: new Date(`${startDate}T00:00:00`) } : {}),
                ...(isDateString(endDate) ? { [Op.lte]: new Date(`${endDate}T23:59:59.999`) } : {}),
            };
        }

        const { rows, count } = await stockMovement.findAndCountAll({
            where,
            include: [
                { model: product, as: "product", attributes: ["id", "sku", "itemName"], required: false },
                { model: supplier, as: "supplier", attributes: ["id", "name"], required: false },
                { model: min_user, as: "user", attributes: ["id", "first_name", "last_name", "username"], required: false },
            ],
            order: [["createdAt", "DESC"]],
            limit: page.limit,
            offset: page.offset,
        });

        return res.json({
            successful: true,
            data: rows.map((row) => ({
                id: row.id,
                productId: row.productId,
                productName: row.product?.itemName || null,
                sku: row.product?.sku || null,
                type: row.type,
                quantity: Number(row.quantity),
                balanceAfter: Number(row.balanceAfter),
                unitCost: row.unitCost !== null ? Number(row.unitCost) : null,
                supplierName: row.supplier?.name || null,
                referenceType: row.referenceType,
                referenceId: row.referenceId,
                note: row.note,
                userName: row.user ? `${row.user.first_name} ${row.user.last_name}`.trim() : null,
                createdAt: row.createdAt,
            })),
            pagination: paginationMeta(page, count),
        });
    })
);

// =====================================================
// STOCK IN (purchase / receiving)
// =====================================================

router.post(
    "/inventory/stock-in",
    MANAGE,
    handler(async (req, res) => {
        const { productId, supplierId, batchNumber, expiryDate, updateCostPrice } = req.body;
        const quantity = requireNumber(req.body.quantity, "Quantity", { gt: 0 });
        const unitCost = isProvided(req.body.unitCost)
            ? requireNumber(req.body.unitCost, "Unit cost", { min: 0 })
            : null;

        const result = await sequelize.transaction(async (transaction) => {
            const found = await findProduct(req.tenantId, productId, transaction);
            await findSupplier(req.tenantId, supplierId, transaction);

            const change = await applyStockChange({
                tenantId: req.tenantId,
                productId: found.id,
                delta: quantity,
                type: STOCK_MOVEMENT_TYPES.PURCHASE,
                userId: req.user.id,
                unitCost,
                supplierId: supplierId || null,
                note: cleanString(req.body.note),
                productName: found.itemName,
                allowNegative: true,
                transaction,
            });

            const inventoryChanges = {};

            if (isProvided(batchNumber)) {
                inventoryChanges.batchNumber = String(batchNumber).trim();
            }

            if (isDateString(expiryDate)) {
                inventoryChanges.expiryDate = expiryDate;
            }

            if (Object.keys(inventoryChanges).length) {
                await change.inventory.update(inventoryChanges, { transaction });
            }

            // Latest purchase price becomes the product's cost price,
            // which drives profit on future sales.
            if (updateCostPrice && unitCost !== null && found.details) {
                await found.details.update({ costPrice: unitCost }, { transaction });
            }

            return change;
        });

        return res.status(201).json({
            successful: true,
            message: "Stock received",
            data: {
                productId,
                quantity: result.balanceAfter,
                movementId: result.movement.id,
            },
        });
    })
);

// =====================================================
// ADJUST (stocktake, damage, return)
// =====================================================

const ADJUST_TYPES = [STOCK_MOVEMENT_TYPES.ADJUSTMENT, STOCK_MOVEMENT_TYPES.DAMAGE, STOCK_MOVEMENT_TYPES.RETURN];

router.post(
    "/inventory/adjust",
    MANAGE,
    handler(async (req, res) => {
        const { productId, type = STOCK_MOVEMENT_TYPES.ADJUSTMENT } = req.body;
        const note = cleanString(req.body.note);

        if (!ADJUST_TYPES.includes(type)) {
            throw badRequest(`type must be one of: ${ADJUST_TYPES.join(", ")}`);
        }

        if (!note) {
            throw badRequest("A reason (note) is required for stock adjustments");
        }

        // adjustment: countedQuantity = what is physically on the shelf
        // damage:     quantity removed
        // return:     quantity put back
        const change = {};

        if (type === STOCK_MOVEMENT_TYPES.ADJUSTMENT) {
            change.setTo = requireNumber(req.body.countedQuantity, "Counted quantity", { min: 0 });
        } else {
            const quantity = requireNumber(req.body.quantity, "Quantity", { gt: 0 });
            change.delta = type === STOCK_MOVEMENT_TYPES.DAMAGE ? -quantity : quantity;
        }

        const result = await sequelize.transaction(async (transaction) => {
            const found = await findProduct(req.tenantId, productId, transaction);

            return applyStockChange({
                tenantId: req.tenantId,
                productId: found.id,
                ...change,
                type,
                userId: req.user.id,
                note,
                productName: found.itemName,
                allowNegative: Boolean(req.tenant?.allowNegativeStock),
                transaction,
            });
        });

        return res.status(201).json({
            successful: true,
            message: "Stock updated",
            data: {
                productId,
                quantity: result.balanceAfter,
                change: Number(result.movement.quantity),
                movementId: result.movement.id,
            },
        });
    })
);

// =====================================================
// SETTINGS PER PRODUCT
// =====================================================

router.put(
    "/inventory/:productId",
    MANAGE,
    handler(async (req, res) => {
        const found = await findProduct(req.tenantId, req.params.productId);
        const changes = {};

        if (req.body.reorderLevel !== undefined) {
            changes.reorderLevel = requireNumber(req.body.reorderLevel, "Reorder level", { min: 0 });
        }

        if (req.body.reorderQuantity !== undefined) {
            changes.reorderQuantity = requireNumber(req.body.reorderQuantity, "Reorder quantity", { min: 0 });
        }

        if (req.body.location !== undefined) {
            changes.location = cleanString(req.body.location);
        }

        if (req.body.batchNumber !== undefined) {
            changes.batchNumber = cleanString(req.body.batchNumber);
        }

        if (req.body.expiryDate !== undefined) {
            changes.expiryDate = isDateString(req.body.expiryDate) ? req.body.expiryDate : null;
        }

        const [row] = await inventory.findOrCreate({
            where: { tenantId: req.tenantId, productId: found.id },
            defaults: { tenantId: req.tenantId, productId: found.id, quantity: 0 },
        });

        await row.update(changes);

        return res.json({ successful: true, message: "Stock settings saved", data: row });
    })
);

export default router;
