"use strict";

// =====================================================
// GLOBAL PRODUCT CATALOG
// =====================================================
//
// GET  /catalog                  search the shared catalog (name / barcode)
// POST /catalog/add-to-store     add catalog items to this store with
//                                the store's own prices and stock
//
// Platform admin (routes/platform):
// GET  /platform/catalog, PUT /platform/catalog/:id

import { Router } from "express";
import { Op } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { catalogNameKey } from "../../models/catalogItem.js";
import { createProduct } from "../../services/products.js";
import { DETAIL_FIELDS, REGULATORY_FIELDS } from "../../services/catalog.js";
import { handler, badRequest, HttpError, isProvided, pagination, paginationMeta } from "../../utils/http.js";

const { sequelize, catalogItem, product, productbarcode, brand, category, unit } = db;

const router = Router();

/** Shared search used by stores and the platform admin. */
export const searchCatalog = async (query) => {
    const page = pagination(query, { defaultLimit: 30, maxLimit: 100 });
    const where = {};

    if (isProvided(query.q)) {
        const term = String(query.q).trim();

        where[Op.or] = [
            { barcode: term },
            { nameKey: { [Op.like]: `%${catalogNameKey(term)}%` } },
            { manufacturer: { [Op.like]: `%${term}%` } },
        ];
    }

    if (query.verified === "true") {
        where.verified = true;
    }

    const { rows, count } = await catalogItem.findAndCountAll({
        where,
        include: [
            { model: brand, as: "brand", attributes: ["id", "name"], required: false },
            { model: category, as: "category", attributes: ["id", "name"], required: false },
            { model: unit, as: "unit", attributes: ["id", "name"], required: false },
        ],
        order: [
            ["storeCount", "DESC"],
            ["verified", "DESC"],
            ["name", "ASC"],
        ],
        limit: page.limit,
        offset: page.offset,
    });

    return { rows, pagination: paginationMeta(page, count) };
};

export const formatCatalogItem = (item) => ({
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    description: item.description,
    brand: item.brand?.name || null,
    category: item.category?.name || null,
    unit: item.unit?.name || null,
    size: item.size,
    netWeight: item.netWeight !== null ? Number(item.netWeight) : null,
    weightUnit: item.weightUnit,
    packagingType: item.packagingType,
    manufacturer: item.manufacturer,
    countryOfOrigin: item.countryOfOrigin,
    verified: item.verified,
    storeCount: item.storeCount,
});

// =====================================================
// SEARCH (with "already in my store" flag)
// =====================================================

router.get(
    "/catalog",
    can(PERMISSIONS.PRODUCTS_VIEW),
    handler(async (req, res) => {
        const { rows, pagination: meta } = await searchCatalog(req.query);

        // Which of these does this store already sell?
        const ids = rows.map((row) => row.id);
        const barcodes = rows.map((row) => row.barcode).filter(Boolean);

        const [linked, byBarcode] = await Promise.all([
            ids.length
                ? product.findAll({
                      where: { tenantId: req.tenantId, catalogItemId: ids },
                      attributes: ["id", "catalogItemId"],
                      raw: true,
                  })
                : [],
            barcodes.length
                ? productbarcode.findAll({
                      where: { tenantId: req.tenantId, barcode: barcodes },
                      attributes: ["productId", "barcode"],
                      raw: true,
                  })
                : [],
        ]);

        const inStoreById = Object.fromEntries(linked.map((row) => [row.catalogItemId, row.id]));
        const inStoreByBarcode = Object.fromEntries(byBarcode.map((row) => [row.barcode, row.productId]));

        return res.json({
            successful: true,
            data: rows.map((row) => ({
                ...formatCatalogItem(row),
                inStoreProductId: inStoreById[row.id] || (row.barcode && inStoreByBarcode[row.barcode]) || null,
            })),
            pagination: meta,
        });
    })
);

// =====================================================
// ADD TO STORE
// =====================================================
//
// body: { items: [{ catalogItemId, sellingPrice, costPrice?, sku?,
//                   minimumSellingPrice?, openingStock?, reorderLevel? }] }
// All or nothing: one bad line rolls back the whole request.

const MAX_ITEMS = 200;

/** SKU from the barcode or name, unique within the store. */
const uniqueSku = async (tenantId, item, requested, transaction) => {
    const base = (
        requested ||
        (item.barcode
            ? `SKU-${item.barcode}`
            : `SKU-${item.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`)
    ).trim();

    if (requested) {
        return base;
    }

    let sku = base;
    let suffix = 2;

    while (await product.findOne({ where: { tenantId, sku }, transaction })) {
        sku = `${base}-${suffix}`;
        suffix += 1;
    }

    return sku;
};

router.post(
    "/catalog/add-to-store",
    can(PERMISSIONS.PRODUCTS_MANAGE),
    handler(async (req, res) => {
        const lines = Array.isArray(req.body.items) ? req.body.items : [];

        if (lines.length === 0) {
            throw badRequest("Choose at least one product to add");
        }

        if (lines.length > MAX_ITEMS) {
            throw badRequest(`Add at most ${MAX_ITEMS} products at a time`);
        }

        const created = await sequelize.transaction(async (transaction) => {
            const results = [];

            for (const line of lines) {
                const item = await catalogItem.findByPk(line.catalogItemId || null, { transaction });

                if (!item) {
                    throw badRequest("A selected product is no longer in the catalog");
                }

                const already = await product.findOne({
                    where: { tenantId: req.tenantId, catalogItemId: item.id },
                    transaction,
                });

                if (already) {
                    throw new HttpError(409, `${item.name} is already in your store`);
                }

                if (!(Number(line.sellingPrice) > 0)) {
                    throw badRequest(`Enter a selling price for ${item.name}`);
                }

                const newProduct = await createProduct({
                    tenant: req.tenant,
                    userId: req.user.id,
                    transaction,
                    data: {
                        catalogItemId: item.id,
                        sku: await uniqueSku(req.tenantId, item, line.sku && String(line.sku).trim(), transaction),
                        itemName: item.name,
                        barcode: item.barcode,
                        barcodeType: item.barcodeType,
                        description: item.description,
                        productType: item.productType,
                        brandId: item.brandId,
                        categoryId: item.categoryId,
                        unitId: item.unitId,
                        ...Object.fromEntries([...DETAIL_FIELDS, ...REGULATORY_FIELDS].map((field) => [field, item[field]])),
                        sellingPrice: line.sellingPrice,
                        costPrice: line.costPrice,
                        minimumSellingPrice: line.minimumSellingPrice,
                        openingStock: line.openingStock,
                        reorderLevel: line.reorderLevel,
                    },
                });

                results.push({ catalogItemId: item.id, productId: newProduct.id, name: item.name, sku: newProduct.sku });
            }

            return results;
        });

        return res.status(201).json({
            successful: true,
            message: `${created.length} product${created.length === 1 ? "" : "s"} added to your store`,
            data: created,
        });
    })
);

export default router;
