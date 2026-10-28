"use strict";

import { v4 as uuidv4 } from "uuid";
import { Op } from "sequelize";

import db from "../models/index.js";
import { applyStockChange } from "./stock.js";
import { STOCK_MOVEMENT_TYPES } from "../models/stockMovement.js";
import { HttpError, badRequest, conflict, cleanString, isDateString } from "../utils/http.js";
import { DETAIL_FIELDS, REGULATORY_FIELDS, linkProductToCatalog, refreshStoreCount } from "./catalog.js";

/**
 * Create a product with its details, barcode and stock record
 * inside the caller's transaction. Used where a product is made
 * from other data (e.g. registering an unregistered item).
 *
 * data: { sku, itemName, sellingPrice, costPrice?, minimumSellingPrice?,
 *         barcode?, openingStock?, reorderLevel?,
 *         batchNumber?, expiryDate? (YYYY-MM-DD), supplierId?,
 *         status? ("active" | "inactive"),
 *         description?, productType?, brandId?, categoryId?, unitId?,
 *         flavor?, size?, netWeight?, weightUnit?, packagingType?,
 *         manufacturer?, countryOfOrigin?,
 *         catalogItemId? }   when set, linked to that catalog item;
 *                            otherwise linked/added by barcode or name
 */
export const createProduct = async ({ tenant, userId, data, transaction }) => {
    const tenantId = tenant.id;
    const sku = cleanString(data.sku);
    const itemName = cleanString(data.itemName);
    const barcode = cleanString(data.barcode);
    const sellingPrice = Number(data.sellingPrice);
    const costPrice = data.costPrice === null || data.costPrice === undefined || data.costPrice === "" ? 0 : Number(data.costPrice);
    const openingStock = Number(data.openingStock) || 0;

    if (!sku || !itemName) {
        throw badRequest("SKU and product name are required");
    }

    if (!(sellingPrice > 0)) {
        throw badRequest("Selling price must be greater than 0");
    }

    if (!(costPrice >= 0) || openingStock < 0) {
        throw badRequest("Cost price and opening stock must be 0 or more");
    }

    const status = data.status || "active";

    if (!["active", "inactive"].includes(status)) {
        throw badRequest("Status must be active or inactive");
    }

    if (data.supplierId && !(await db.supplier.findOne({ where: { id: data.supplierId, tenantId }, transaction }))) {
        throw badRequest("Supplier not found");
    }

    const maxProducts = tenant.plan?.maxProducts;

    const activeCount = await db.product.count({ where: { tenantId, status: { [Op.ne]: "removed" } }, transaction });

    if (maxProducts && activeCount >= maxProducts) {
        throw new HttpError(403, `Your plan allows ${maxProducts} products. Upgrade to add more.`, { code: "PLAN_LIMIT" });
    }

    if (await db.product.findOne({ where: { tenantId, sku }, transaction })) {
        throw conflict("Product SKU already exists");
    }

    if (barcode && (await db.productbarcode.findOne({ where: { tenantId, barcode }, transaction }))) {
        throw conflict("Barcode already belongs to another product");
    }

    const productId = uuidv4();

    const created = await db.product.create(
        {
            id: productId,
            tenantId,
            sku,
            itemName,
            productName: itemName,
            description: data.description || null,
            productType: data.productType || null,
            brandId: data.brandId || null,
            categoryId: data.categoryId || null,
            unitId: data.unitId || null,
            status,
        },
        { transaction }
    );

    await db.productdetails.create(
        {
            id: uuidv4(),
            tenantId,
            productId,
            costPrice,
            sellingPrice,
            minimumSellingPrice: data.minimumSellingPrice ? Number(data.minimumSellingPrice) : null,
            ...Object.fromEntries(DETAIL_FIELDS.map((field) => [field, data[field] ?? null])),
        },
        { transaction }
    );

    if (barcode) {
        await db.productbarcode.create(
            { id: uuidv4(), tenantId, productId, barcode, barcodeType: "EAN-13", isPrimary: true },
            { transaction }
        );
    }

    await db.productregulatory.create(
        {
            id: uuidv4(),
            tenantId,
            productId,
            ...Object.fromEntries(REGULATORY_FIELDS.map((field) => [field, data[field] ?? null])),
        },
        { transaction }
    );

    await db.inventory.create(
        {
            tenantId,
            productId,
            quantity: 0,
            reorderLevel: Number(data.reorderLevel) || 0,
            batchNumber: cleanString(data.batchNumber),
            expiryDate: isDateString(data.expiryDate) ? data.expiryDate : null,
        },
        { transaction }
    );

    if (openingStock > 0) {
        await applyStockChange({
            tenantId,
            productId,
            delta: openingStock,
            type: STOCK_MOVEMENT_TYPES.OPENING,
            userId,
            unitCost: costPrice,
            note: "Opening stock",
            supplierId: data.supplierId || null,
            transaction,
        });
    }

    if (data.catalogItemId) {
        await created.update({ catalogItemId: data.catalogItemId }, { transaction });
        await refreshStoreCount(data.catalogItemId, transaction);
    } else {
        await linkProductToCatalog({ product: created, barcode, barcodeType: data.barcodeType, transaction });
    }

    return created;
};
