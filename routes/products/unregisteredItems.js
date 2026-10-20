"use strict";

// =====================================================
// UNREGISTERED ITEMS
// =====================================================
//
// Items cashiers sold that were not in the product list.
//
// GET  /unregistered-items                 list (status, search)
// POST /unregistered-items/:id/register    create a product from it
// POST /unregistered-items/:id/link        it was an existing product
// POST /unregistered-items/:id/dismiss     ignore (e.g. one-off item)
//
// Registering or linking moves the past sale lines onto the
// product, and fills in cost/profit on lines sold without a cost.

import { Router } from "express";
import { Op, QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { UNREGISTERED_STATUS } from "../../models/unregisteredItem.js";
import { createProduct } from "../../services/products.js";
import { handler, badRequest, notFound, isProvided, round2 } from "../../utils/http.js";

const { sequelize, unregisteredItem, product, productdetails, min_user } = db;

const router = Router();

router.use("/unregistered-items", can(PERMISSIONS.PRODUCTS_MANAGE));

const format = (row, revenue = 0) => ({
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    sellingPrice: Number(row.sellingPrice),
    costPrice: row.costPrice !== null ? Number(row.costPrice) : null,
    quantitySold: Number(row.quantitySold),
    timesSold: row.timesSold,
    revenue: round2(revenue),
    lastSoldAt: row.lastSoldAt,
    status: row.status,
    productId: row.productId,
    productName: row.product?.itemName || null,
    addedBy: row.creator ? `${row.creator.first_name} ${row.creator.last_name}`.trim() : null,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
});

/** Pending item of this tenant, locked for update. */
const findPending = async (req, transaction) => {
    const row = await unregisteredItem.findOne({
        where: { id: req.params.id, tenantId: req.tenantId },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (!row) {
        throw notFound("Item not found");
    }

    if (row.status !== UNREGISTERED_STATUS.PENDING) {
        throw badRequest(`This item is already ${row.status}`);
    }

    return row;
};

/** Point the item's sale lines at the product; fill in missing cost. */
const attachSales = async (row, productId, costPrice, transaction) => {
    await sequelize.query(
        `UPDATE salesItems
            SET productId = :productId,
                -- MySQL applies SET left to right: profit must read the old costPrice
                profit = CASE WHEN costPrice IS NULL THEN (unitPrice - :costPrice) * quantity ELSE profit END,
                costPrice = COALESCE(costPrice, :costPrice)
          WHERE unregisteredItemId = :id AND tenantId = :tenantId`,
        {
            replacements: { productId, costPrice: Number(costPrice) || 0, id: row.id, tenantId: row.tenantId },
            transaction,
        }
    );
};

router.get(
    "/unregistered-items",
    handler(async (req, res) => {
        const { status = UNREGISTERED_STATUS.PENDING, search } = req.query;
        const where = { tenantId: req.tenantId };

        if (status !== "all") {
            where.status = status;
        }

        if (isProvided(search)) {
            const term = `%${String(search).trim()}%`;
            where[Op.or] = [{ name: { [Op.like]: term } }, { barcode: { [Op.like]: term } }];
        }

        const rows = await unregisteredItem.findAll({
            where,
            include: [
                { model: min_user, as: "creator", attributes: ["first_name", "last_name"], required: false },
                { model: product, as: "product", attributes: ["itemName"], required: false },
            ],
            order: [
                ["lastSoldAt", "DESC"],
                ["createdAt", "DESC"],
            ],
            limit: 500,
        });

        const revenueRows = rows.length
            ? await sequelize.query(
                  `SELECT unregisteredItemId AS id, SUM(subtotal) AS revenue
                     FROM salesItems
                    WHERE tenantId = :tenantId AND unregisteredItemId IN (:ids)
                    GROUP BY unregisteredItemId`,
                  { replacements: { tenantId: req.tenantId, ids: rows.map((row) => row.id) }, type: QueryTypes.SELECT }
              )
            : [];

        const revenue = Object.fromEntries(revenueRows.map((row) => [row.id, Number(row.revenue)]));

        const pending = await unregisteredItem.count({
            where: { tenantId: req.tenantId, status: UNREGISTERED_STATUS.PENDING },
        });

        return res.json({
            successful: true,
            data: rows.map((row) => format(row, revenue[row.id])),
            summary: { pending },
        });
    })
);

router.post(
    "/unregistered-items/:id/register",
    handler(async (req, res) => {
        const result = await sequelize.transaction(async (transaction) => {
            const row = await findPending(req, transaction);

            const created = await createProduct({
                tenant: req.tenant,
                userId: req.user.id,
                data: {
                    ...req.body,
                    itemName: req.body.itemName || row.name,
                    barcode: req.body.barcode !== undefined ? req.body.barcode : row.barcode,
                    sellingPrice: req.body.sellingPrice ?? row.sellingPrice,
                    costPrice: req.body.costPrice ?? row.costPrice,
                },
                transaction,
            });

            const details = await productdetails.findOne({ where: { productId: created.id }, transaction });

            await attachSales(row, created.id, details.costPrice, transaction);

            await row.update(
                {
                    status: UNREGISTERED_STATUS.REGISTERED,
                    productId: created.id,
                    resolvedBy: req.user.id,
                    resolvedAt: new Date(),
                },
                { transaction }
            );

            return created;
        });

        return res.status(201).json({
            successful: true,
            message: `${result.itemName} is now a registered product`,
            data: { productId: result.id },
        });
    })
);

router.post(
    "/unregistered-items/:id/link",
    handler(async (req, res) => {
        const linked = await sequelize.transaction(async (transaction) => {
            const row = await findPending(req, transaction);

            const target = await product.findOne({
                where: { id: req.body.productId || null, tenantId: req.tenantId },
                include: [{ model: productdetails, as: "details", required: false }],
                transaction,
            });

            if (!target) {
                throw badRequest("Choose an existing product to link to");
            }

            await attachSales(row, target.id, target.details?.costPrice, transaction);

            await row.update(
                {
                    status: UNREGISTERED_STATUS.REGISTERED,
                    productId: target.id,
                    resolvedBy: req.user.id,
                    resolvedAt: new Date(),
                },
                { transaction }
            );

            return target;
        });

        return res.json({ successful: true, message: `Sales moved to ${linked.itemName}`, data: { productId: linked.id } });
    })
);

router.post(
    "/unregistered-items/:id/dismiss",
    handler(async (req, res) => {
        await sequelize.transaction(async (transaction) => {
            const row = await findPending(req, transaction);

            await row.update(
                { status: UNREGISTERED_STATUS.DISMISSED, resolvedBy: req.user.id, resolvedAt: new Date() },
                { transaction }
            );
        });

        return res.json({ successful: true, message: "Item dismissed" });
    })
);

export default router;
