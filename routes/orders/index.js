"use strict";

// =====================================================
// PURCHASE ORDERS (stock ordered from suppliers)
// =====================================================
//
// GET  /purchase-orders                 list + summary (status, search)
// GET  /purchase-orders/suggestions     low / out of stock products to reorder
// GET  /purchase-orders/:id             one order with its lines
// POST /purchase-orders                 create (status pending)
// PUT  /purchase-orders/:id             edit a pending order
// POST /purchase-orders/:id/complete    goods received: add stock, record the purchase
// POST /purchase-orders/:id/cancel      never received
//
// Each line has a quantity and the total amount paid for it; the
// buying price per unit is totalAmount / quantity. Completing the
// order adds the stock, makes that unit cost the product's cost
// price (optional) and counts the order total as money spent.

import { Router } from "express";
import { Op, QueryTypes } from "sequelize";

import db from "../../models/index.js";
import { can, has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";
import { PAYMENT_METHODS } from "../../config/defaults.js";
import { applyStockChange } from "../../services/stock.js";
import { STOCK_MOVEMENT_TYPES } from "../../models/stockMovement.js";
import { ORDER_STATUS } from "../../models/purchaseOrder.js";
import {
    handler,
    badRequest,
    notFound,
    conflict,
    cleanString,
    isProvided,
    isDateString,
    requireNumber,
    round2,
    round3,
    pagination,
    paginationMeta,
} from "../../utils/http.js";

const { sequelize, tenant, purchaseOrder, purchaseOrderItem, product, productbarcode, productdetails, inventory, supplier, min_user } = db;

const router = Router();

const VIEW = can(PERMISSIONS.ORDERS_VIEW);
const CREATE = can(PERMISSIONS.ORDERS_CREATE);
const COMPLETE = can(PERMISSIONS.ORDERS_COMPLETE);

const MAX_LINES = 500;

export const orderReference = (number) => `PO-${String(number).padStart(4, "0")}`;

const userName = (user) => (user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username : null);

const USER_ATTRIBUTES = ["id", "first_name", "last_name", "username"];

const orderIncludes = (withItems) => [
    { model: supplier, as: "supplier", attributes: ["id", "name", "contactPerson", "phone", "email", "address", "city"], required: false },
    { model: min_user, as: "creator", attributes: USER_ATTRIBUTES, required: false },
    { model: min_user, as: "completer", attributes: USER_ATTRIBUTES, required: false },
    ...(withItems
        ? [
              {
                  model: purchaseOrderItem,
                  as: "items",
                  required: false,
                  include: [
                      {
                          model: product,
                          as: "product",
                          attributes: ["id", "sku", "itemName", "status"],
                          required: false,
                          include: [
                              { model: productbarcode, as: "barcodes", attributes: ["barcode", "isPrimary"], required: false },
                              { model: inventory, as: "inventory", attributes: ["quantity", "reorderLevel"], required: false },
                          ],
                      },
                  ],
              },
          ]
        : []),
];

const numberOrNull = (value) => (value === null || value === undefined ? null : Number(value));

const serializeItem = (item) => {
    const barcodes = item.product?.barcodes || [];
    const primary = barcodes.find((row) => row.isPrimary) || barcodes[0];

    return {
        id: item.id,
        productId: item.productId,
        sku: item.product?.sku || null,
        itemName: item.product?.itemName || "Removed product",
        productStatus: item.product?.status || null,
        barcode: primary?.barcode || null,
        inStock: item.product?.inventory ? Number(item.product.inventory.quantity) : 0,
        quantity: Number(item.quantity),
        totalAmount: numberOrNull(item.totalAmount),
        unitCost: numberOrNull(item.unitCost),
    };
};

const serializeOrder = (order) => {
    const items = order.items ? [...order.items].sort((a, b) => a.sortOrder - b.sortOrder).map(serializeItem) : undefined;

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        reference: orderReference(order.orderNumber),
        status: order.status,
        supplierId: order.supplierId,
        supplier: order.supplier
            ? {
                  id: order.supplier.id,
                  name: order.supplier.name,
                  contactPerson: order.supplier.contactPerson,
                  phone: order.supplier.phone,
                  email: order.supplier.email,
                  address: order.supplier.address,
                  city: order.supplier.city,
              }
            : null,
        expectedDate: order.expectedDate,
        notes: order.notes,
        totalAmount: Number(order.totalAmount),
        paymentMethod: order.paymentMethod,
        createdBy: userName(order.creator),
        completedBy: userName(order.completer),
        completedAt: order.completedAt,
        cancelledAt: order.cancelledAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        ...(items
            ? {
                  items,
                  itemCount: items.length,
                  totalQuantity: round3(items.reduce((sum, item) => sum + item.quantity, 0)),
                  // Lines still waiting for a price
                  unpricedCount: items.filter((item) => item.totalAmount === null).length,
              }
            : {}),
    };
};

/** Order of this tenant (row-locked inside a transaction), or 404. */
const findOrder = async (tenantId, id, transaction) => {
    const found = await purchaseOrder.findOne({
        where: { id, tenantId },
        transaction,
        ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });

    if (!found) {
        throw notFound("Order not found");
    }

    return found;
};

const loadOrder = async (tenantId, id) => {
    const found = await purchaseOrder.findOne({ where: { id, tenantId }, include: orderIncludes(true) });

    if (!found) {
        throw notFound("Order not found");
    }

    return serializeOrder(found);
};

const checkSupplier = async (tenantId, supplierId, transaction) => {
    if (!isProvided(supplierId)) {
        return null;
    }

    const found = await supplier.findOne({ where: { id: supplierId, tenantId }, transaction });

    if (!found) {
        throw notFound("Supplier not found");
    }

    return found.id;
};

/**
 * Validates order lines: [{ productId, quantity, totalAmount? }].
 * Returns rows ready for purchaseOrderItem.bulkCreate.
 */
const parseLines = async (tenantId, items, transaction, { requireAmounts = false } = {}) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw badRequest("Add at least one product to the order");
    }

    if (items.length > MAX_LINES) {
        throw badRequest(`An order can have at most ${MAX_LINES} products`);
    }

    const ids = items.map((item) => item?.productId).filter(Boolean);

    const products = await product.findAll({
        where: { tenantId, id: { [Op.in]: ids.length ? ids : [""] } },
        attributes: ["id", "itemName", "status"],
        transaction,
    });

    const byId = new Map(products.map((row) => [row.id, row]));
    const seen = new Set();

    return items.map((item, index) => {
        const found = byId.get(item?.productId);

        if (!found) {
            throw badRequest(`Line ${index + 1}: product not found`);
        }

        if (seen.has(found.id)) {
            throw badRequest(`${found.itemName} is on the order twice. Combine the quantities on one line.`);
        }

        seen.add(found.id);

        const quantity = round3(requireNumber(item.quantity, `${found.itemName}: quantity`, { gt: 0 }));

        let totalAmount = null;

        if (isProvided(item.totalAmount)) {
            totalAmount = round2(requireNumber(item.totalAmount, `${found.itemName}: total amount`, { min: 0 }));
        } else if (requireAmounts) {
            throw badRequest(`Enter the total amount paid for ${found.itemName}`);
        }

        return {
            tenantId,
            productId: found.id,
            quantity,
            totalAmount,
            unitCost: totalAmount === null ? null : round2(totalAmount / quantity),
            sortOrder: index,
        };
    });
};

const parseHeader = async (tenantId, body, transaction) => {
    const data = {};

    if (body.supplierId !== undefined) {
        data.supplierId = await checkSupplier(tenantId, body.supplierId, transaction);
    }

    if (body.expectedDate !== undefined) {
        if (isProvided(body.expectedDate) && !isDateString(body.expectedDate)) {
            throw badRequest("Expected date must be YYYY-MM-DD");
        }

        data.expectedDate = isProvided(body.expectedDate) ? body.expectedDate : null;
    }

    if (body.notes !== undefined) {
        data.notes = cleanString(body.notes);
    }

    return data;
};

const sumLines = (lines) => round2(lines.reduce((sum, line) => sum + (line.totalAmount || 0), 0));

const replaceLines = async (order, lines, transaction) => {
    await purchaseOrderItem.destroy({ where: { orderId: order.id, tenantId: order.tenantId }, transaction });
    await purchaseOrderItem.bulkCreate(
        lines.map((line) => ({ ...line, orderId: order.id })),
        { transaction }
    );
};

const requirePending = (order) => {
    if (order.status !== ORDER_STATUS.PENDING) {
        throw conflict(`${orderReference(order.orderNumber)} is ${order.status} and can no longer be changed`);
    }
};

// =====================================================
// LIST
// =====================================================

router.get(
    "/purchase-orders",
    VIEW,
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const page = pagination(req.query, { defaultLimit: 25 });
        const where = { tenantId };

        if (Object.values(ORDER_STATUS).includes(req.query.status)) {
            where.status = req.query.status;
        }

        if (isProvided(req.query.search)) {
            const term = String(req.query.search).trim();
            const number = Number.parseInt(term.replace(/^po-?/i, ""), 10);

            const supplierIds = (
                await supplier.findAll({
                    where: { tenantId, name: { [Op.like]: `%${term}%` } },
                    attributes: ["id"],
                    raw: true,
                })
            ).map((row) => row.id);

            where[Op.or] = [
                ...(Number.isFinite(number) ? [{ orderNumber: number }] : []),
                ...(supplierIds.length ? [{ supplierId: { [Op.in]: supplierIds } }] : []),
                { notes: { [Op.like]: `%${term}%` } },
            ];
        }

        const { rows, count } = await purchaseOrder.findAndCountAll({
            where,
            include: orderIncludes(false),
            order: [["createdAt", "DESC"]],
            limit: page.limit,
            offset: page.offset,
            distinct: true,
        });

        // Line counts for the listed orders in one query
        const ids = rows.map((row) => row.id);
        const counts = ids.length
            ? await sequelize.query(
                  `SELECT orderId, COUNT(*) AS items, SUM(quantity) AS quantity,
                          SUM(CASE WHEN totalAmount IS NULL THEN 1 ELSE 0 END) AS unpriced
                     FROM purchaseOrderItems WHERE orderId IN (:ids) GROUP BY orderId`,
                  { replacements: { ids }, type: QueryTypes.SELECT }
              )
            : [];
        const countsById = Object.fromEntries(counts.map((row) => [row.orderId, row]));

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [summary] = await sequelize.query(
            `SELECT
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pendingCount,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN totalAmount ELSE 0 END), 0) AS pendingAmount,
                COALESCE(SUM(CASE WHEN status = 'completed' AND completedAt >= :monthStart THEN 1 ELSE 0 END), 0) AS completedThisMonth,
                COALESCE(SUM(CASE WHEN status = 'completed' AND completedAt >= :monthStart THEN totalAmount ELSE 0 END), 0) AS spentThisMonth
               FROM purchaseOrders WHERE tenantId = :tenantId`,
            { replacements: { tenantId, monthStart }, type: QueryTypes.SELECT }
        );

        return res.json({
            successful: true,
            data: rows.map((row) => ({
                ...serializeOrder(row),
                itemCount: Number(countsById[row.id]?.items || 0),
                totalQuantity: round3(countsById[row.id]?.quantity || 0),
                unpricedCount: Number(countsById[row.id]?.unpriced || 0),
            })),
            pagination: paginationMeta(page, count),
            summary: {
                pendingCount: Number(summary.pendingCount),
                pendingAmount: round2(summary.pendingAmount),
                completedThisMonth: Number(summary.completedThisMonth),
                spentThisMonth: round2(summary.spentThisMonth),
            },
        });
    })
);

// =====================================================
// REORDER SUGGESTIONS
// =====================================================
//
// Active products that are out of stock or at/below their reorder
// level (only products whose stock is being counted, same rule as
// the dashboard), with the reorder quantity as the suggestion.

router.get(
    "/purchase-orders/suggestions",
    CREATE,
    handler(async (req, res) => {
        const showCost = has(req, PERMISSIONS.PRODUCTS_VIEW_COST);

        const rows = await sequelize.query(
            `SELECT p.id AS productId, p.sku, p.itemName,
                    COALESCE(i.quantity, 0) AS inStock,
                    COALESCE(i.reorderLevel, 0) AS reorderLevel,
                    COALESCE(i.reorderQuantity, 0) AS reorderQuantity,
                    COALESCE(d.costPrice, 0) AS costPrice
               FROM products p
               JOIN (SELECT DISTINCT productId FROM stockMovements WHERE tenantId = :tenantId) tracked
                 ON tracked.productId = p.id
               LEFT JOIN inventory i ON i.productId = p.id AND i.tenantId = p.tenantId
               LEFT JOIN productdetails d ON d.productId = p.id AND d.tenantId = p.tenantId
              WHERE p.tenantId = :tenantId AND p.status = 'active'
                AND COALESCE(i.quantity, 0) <= COALESCE(i.reorderLevel, 0)
              ORDER BY COALESCE(i.quantity, 0) <= 0 DESC, p.itemName ASC
              LIMIT 200`,
            { replacements: { tenantId: req.tenantId }, type: QueryTypes.SELECT }
        );

        return res.json({
            successful: true,
            data: rows.map((row) => {
                const inStock = Number(row.inStock);
                const reorderLevel = Number(row.reorderLevel);
                const reorderQuantity = Number(row.reorderQuantity);

                return {
                    productId: row.productId,
                    sku: row.sku,
                    itemName: row.itemName,
                    inStock,
                    reorderLevel,
                    // Reorder quantity when set, otherwise enough to get back above the level
                    suggestedQuantity: reorderQuantity > 0 ? reorderQuantity : Math.max(1, round3(reorderLevel - inStock + 1)),
                    ...(showCost ? { costPrice: Number(row.costPrice) } : {}),
                };
            }),
        });
    })
);

// =====================================================
// ONE ORDER
// =====================================================

router.get(
    "/purchase-orders/:id",
    VIEW,
    handler(async (req, res) => {
        return res.json({ successful: true, data: await loadOrder(req.tenantId, req.params.id) });
    })
);

// =====================================================
// CREATE
// =====================================================

router.post(
    "/purchase-orders",
    CREATE,
    handler(async (req, res) => {
        const tenantId = req.tenantId;

        const id = await sequelize.transaction(async (transaction) => {
            // Lock the store row so two orders never get the same number.
            await tenant.findOne({ where: { id: tenantId }, transaction, lock: transaction.LOCK.UPDATE });

            const header = await parseHeader(tenantId, req.body, transaction);
            const lines = await parseLines(tenantId, req.body.items, transaction);

            const last = await purchaseOrder.max("orderNumber", { where: { tenantId }, transaction });

            const created = await purchaseOrder.create(
                {
                    ...header,
                    tenantId,
                    orderNumber: (Number(last) || 0) + 1,
                    status: ORDER_STATUS.PENDING,
                    totalAmount: sumLines(lines),
                    createdBy: req.user.id,
                },
                { transaction }
            );

            await replaceLines(created, lines, transaction);

            return created.id;
        });

        const data = await loadOrder(tenantId, id);

        return res.status(201).json({ successful: true, message: `Order ${data.reference} created`, data });
    })
);

// =====================================================
// EDIT (pending only)
// =====================================================

router.put(
    "/purchase-orders/:id",
    CREATE,
    handler(async (req, res) => {
        const tenantId = req.tenantId;

        await sequelize.transaction(async (transaction) => {
            const order = await findOrder(tenantId, req.params.id, transaction);
            requirePending(order);

            const changes = { ...(await parseHeader(tenantId, req.body, transaction)), updatedBy: req.user.id };

            if (req.body.items !== undefined) {
                const lines = await parseLines(tenantId, req.body.items, transaction);
                await replaceLines(order, lines, transaction);
                changes.totalAmount = sumLines(lines);
            }

            await order.update(changes, { transaction });
        });

        const data = await loadOrder(tenantId, req.params.id);

        return res.json({ successful: true, message: `Order ${data.reference} updated`, data });
    })
);

// =====================================================
// COMPLETE (goods received)
// =====================================================
//
// body: { paymentMethod, updateCostPrice = true, items?, supplierId?, notes? }
// `items` (same shape as create) replaces the lines first, so the
// final received quantities and amounts can be confirmed in one step.

router.post(
    "/purchase-orders/:id/complete",
    COMPLETE,
    handler(async (req, res) => {
        const tenantId = req.tenantId;
        const paymentMethod = req.body.paymentMethod || "cash";
        const updateCostPrice = req.body.updateCostPrice !== false;

        if (!PAYMENT_METHODS.includes(paymentMethod)) {
            throw badRequest(`Payment method must be one of: ${PAYMENT_METHODS.join(", ")}`);
        }

        await sequelize.transaction(async (transaction) => {
            const order = await findOrder(tenantId, req.params.id, transaction);
            requirePending(order);

            const header = await parseHeader(tenantId, req.body, transaction);

            let lines;

            if (req.body.items !== undefined) {
                lines = await parseLines(tenantId, req.body.items, transaction, { requireAmounts: true });
                await replaceLines(order, lines, transaction);
            } else {
                const saved = await purchaseOrderItem.findAll({
                    where: { orderId: order.id, tenantId },
                    include: [{ model: product, as: "product", attributes: ["id", "itemName"], required: false }],
                    order: [["sortOrder", "ASC"]],
                    transaction,
                });

                lines = await parseLines(
                    tenantId,
                    saved.map((line) => ({ productId: line.productId, quantity: line.quantity, totalAmount: line.totalAmount })),
                    transaction,
                    { requireAmounts: true }
                );
            }

            const reference = orderReference(order.orderNumber);
            const supplierId = header.supplierId !== undefined ? header.supplierId : order.supplierId;

            for (const line of lines) {
                await applyStockChange({
                    tenantId,
                    productId: line.productId,
                    delta: line.quantity,
                    type: STOCK_MOVEMENT_TYPES.PURCHASE,
                    userId: req.user.id,
                    unitCost: line.unitCost,
                    referenceType: "purchaseOrder",
                    referenceId: order.id,
                    supplierId,
                    note: `Order ${reference}`,
                    allowNegative: true,
                    transaction,
                });

                // Latest buying price drives profit on future sales.
                if (updateCostPrice && line.unitCost > 0) {
                    await productdetails.update(
                        { costPrice: line.unitCost },
                        { where: { tenantId, productId: line.productId }, transaction }
                    );
                }
            }

            await order.update(
                {
                    ...header,
                    status: ORDER_STATUS.COMPLETED,
                    totalAmount: sumLines(lines),
                    paymentMethod,
                    completedBy: req.user.id,
                    completedAt: new Date(),
                    updatedBy: req.user.id,
                },
                { transaction }
            );
        });

        const data = await loadOrder(tenantId, req.params.id);

        return res.json({ successful: true, message: `Order ${data.reference} completed. Stock updated.`, data });
    })
);

// =====================================================
// CANCEL
// =====================================================

router.post(
    "/purchase-orders/:id/cancel",
    COMPLETE,
    handler(async (req, res) => {
        await sequelize.transaction(async (transaction) => {
            const order = await findOrder(req.tenantId, req.params.id, transaction);
            requirePending(order);

            await order.update(
                {
                    status: ORDER_STATUS.CANCELLED,
                    cancelledBy: req.user.id,
                    cancelledAt: new Date(),
                    updatedBy: req.user.id,
                },
                { transaction }
            );
        });

        const data = await loadOrder(req.tenantId, req.params.id);

        return res.json({ successful: true, message: `Order ${data.reference} cancelled`, data });
    })
);

export default router;
