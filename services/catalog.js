"use strict";

import db from "../models/index.js";
import { catalogNameKey } from "../models/catalogItem.js";

// Identity fields copied between a store product and the catalog.
export const DETAIL_FIELDS = ["flavor", "size", "netWeight", "weightUnit", "packagingType"];
export const REGULATORY_FIELDS = ["manufacturer", "countryOfOrigin"];

/** Keep a lookup id only if it is a shared (tenantId NULL) row. */
const sharedId = async (model, id, transaction) => {
    if (!id) {
        return null;
    }

    const row = await model.findOne({ where: { id, tenantId: null }, transaction });

    return row ? row.id : null;
};

/** Recount how many stores sell the item. */
export const refreshStoreCount = async (catalogItemId, transaction) => {
    if (!catalogItemId) {
        return;
    }

    await db.sequelize.query(
        `UPDATE catalogItems
            SET storeCount = (
                SELECT COUNT(DISTINCT tenantId) FROM products
                 WHERE catalogItemId = :id AND status <> 'removed'
            )
          WHERE id = :id`,
        { replacements: { id: catalogItemId }, transaction }
    );
};

/**
 * Point a store product at its catalog item, creating the catalog
 * item from the product if nobody has registered it before.
 * Existing catalog items are never overwritten by a store.
 *
 * Match: barcode when the product has one, else the same name
 * among catalog items without a barcode.
 */
export const linkProductToCatalog = async ({ product, barcode, barcodeType, transaction }) => {
    const cleanBarcode = barcode ? String(barcode).trim() : null;
    const nameKey = catalogNameKey(product.itemName);

    let item = cleanBarcode
        ? await db.catalogItem.findOne({ where: { barcode: cleanBarcode }, transaction })
        : await db.catalogItem.findOne({ where: { nameKey, barcode: null }, transaction });

    if (!item) {
        const details = await db.productdetails.findOne({ where: { productId: product.id }, transaction });
        const regulatory = await db.productregulatory.findOne({ where: { productId: product.id }, transaction });

        item = await db.catalogItem.create(
            {
                name: product.itemName,
                barcode: cleanBarcode,
                barcodeType: cleanBarcode ? barcodeType || "EAN-13" : null,
                nameKey,
                description: product.description,
                productType: product.productType,
                brandId: await sharedId(db.brand, product.brandId, transaction),
                categoryId: await sharedId(db.category, product.categoryId, transaction),
                unitId: await sharedId(db.unit, product.unitId, transaction),
                ...Object.fromEntries(DETAIL_FIELDS.map((field) => [field, details?.[field] ?? null])),
                ...Object.fromEntries(REGULATORY_FIELDS.map((field) => [field, regulatory?.[field] ?? null])),
                createdByTenantId: product.tenantId,
            },
            { transaction }
        );
    }

    await product.update({ catalogItemId: item.id }, { transaction });
    await refreshStoreCount(item.id, transaction);

    return item;
};

/**
 * Copy changed catalog fields onto every store product linked to the
 * item (prices, stock and SKU are never touched).
 *
 * A new barcode is skipped for a store that already uses it on a
 * different product.
 *
 * @returns {{ products: number, barcodeSkipped: string[] }} store names skipped
 */
export const applyCatalogToStores = async ({ item, changed, transaction }) => {
    const linked = await db.product.findAll({ where: { catalogItemId: item.id }, transaction });
    const barcodeSkipped = [];

    const productChanges = {};

    if (changed.includes("name")) {
        productChanges.itemName = item.name;
        productChanges.productName = item.name;
    }

    for (const field of ["description", "productType", "brandId", "categoryId", "unitId"]) {
        if (changed.includes(field)) productChanges[field] = item[field];
    }

    const detailChanges = Object.fromEntries(DETAIL_FIELDS.filter((f) => changed.includes(f)).map((f) => [f, item[f]]));
    const regulatoryChanges = Object.fromEntries(REGULATORY_FIELDS.filter((f) => changed.includes(f)).map((f) => [f, item[f]]));

    for (const storeProduct of linked) {
        if (Object.keys(productChanges).length) {
            await storeProduct.update(productChanges, { transaction });
        }

        if (Object.keys(detailChanges).length) {
            await db.productdetails.update(detailChanges, { where: { productId: storeProduct.id }, transaction });
        }

        if (Object.keys(regulatoryChanges).length) {
            await db.productregulatory.update(regulatoryChanges, { where: { productId: storeProduct.id }, transaction });
        }

        if (changed.includes("barcode") && item.barcode) {
            const clash = await db.productbarcode.findOne({
                where: { tenantId: storeProduct.tenantId, barcode: item.barcode },
                transaction,
            });

            if (clash && clash.productId !== storeProduct.id) {
                const store = await db.tenant.findByPk(storeProduct.tenantId, { transaction });
                barcodeSkipped.push(store?.name || storeProduct.tenantId);
                continue;
            }

            const primary = await db.productbarcode.findOne({
                where: { productId: storeProduct.id },
                order: [["isPrimary", "DESC"]],
                transaction,
            });

            if (primary) {
                await primary.update({ barcode: item.barcode, barcodeType: item.barcodeType || primary.barcodeType }, { transaction });
            } else {
                await db.productbarcode.create(
                    {
                        tenantId: storeProduct.tenantId,
                        productId: storeProduct.id,
                        barcode: item.barcode,
                        barcodeType: item.barcodeType || "EAN-13",
                        isPrimary: true,
                    },
                    { transaction }
                );
            }
        }
    }

    return { products: linked.length, barcodeSkipped };
};
