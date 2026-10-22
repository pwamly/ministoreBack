"use strict";

// POST /products/:id/remove    take a product off this store
// POST /products/:id/restore   put a removed product back on sale
// GET  /lookups                categories, brands, units, tax groups for filters/forms
//
// Removing keeps the product row (sales history points at it) but
// hides it from checkout, product lists and inventory. It can also
// come back by adding it again from the Product Catalog.

import { Router } from "express";
import { Op } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { refreshStoreCount } from "../../services/catalog.js";
import { handler, badRequest, notFound, HttpError } from "../../utils/http.js";

const { product, inventory, category, brand, unit, taxgroup } = db;

const router = Router();

const findProduct = async (req) => {
    const found = await product.findOne({ where: { id: req.params.id, tenantId: req.tenantId } });

    if (!found) {
        throw notFound("Product not found");
    }

    return found;
};

router.post(
    "/products/:id/remove",
    can(PERMISSIONS.PRODUCTS_MANAGE),
    handler(async (req, res) => {
        const found = await findProduct(req);

        if (found.status === "removed") {
            throw badRequest(`${found.itemName} is already removed`);
        }

        const stock = await inventory.findOne({ where: { tenantId: req.tenantId, productId: found.id } });

        await found.update({ status: "removed" });
        await refreshStoreCount(found.catalogItemId);

        const left = Number(stock?.quantity || 0);

        return res.json({
            successful: true,
            message:
                left > 0
                    ? `${found.itemName} removed from your store (${left} still recorded in stock)`
                    : `${found.itemName} removed from your store`,
        });
    })
);

router.post(
    "/products/:id/restore",
    can(PERMISSIONS.PRODUCTS_MANAGE),
    handler(async (req, res) => {
        const found = await findProduct(req);

        if (found.status !== "removed") {
            throw badRequest(`${found.itemName} is not removed`);
        }

        const maxProducts = req.tenant?.plan?.maxProducts;

        if (maxProducts) {
            const count = await product.count({ where: { tenantId: req.tenantId, status: { [Op.ne]: "removed" } } });

            if (count >= maxProducts) {
                throw new HttpError(403, `Your plan allows ${maxProducts} products. Upgrade to add more.`, { code: "PLAN_LIMIT" });
            }
        }

        await found.update({ status: "active" });
        await refreshStoreCount(found.catalogItemId);

        return res.json({ successful: true, message: `${found.itemName} is back on sale` });
    })
);

router.get(
    "/lookups",
    can(PERMISSIONS.PRODUCTS_VIEW),
    handler(async (req, res) => {
        // Shared rows (tenantId NULL) plus this store's own.
        const where = { [Op.or]: [{ tenantId: null }, { tenantId: req.tenantId }] };
        const options = { where, attributes: ["id", "name"], order: [["name", "ASC"]] };

        const [categories, brands, units, taxGroups] = await Promise.all([
            category.findAll(options),
            brand.findAll(options),
            unit.findAll(options),
            taxgroup.findAll({ ...options, attributes: ["id", "name", "rate"] }),
        ]);

        return res.json({ successful: true, data: { categories, brands, units, taxGroups } });
    })
);

export default router;
