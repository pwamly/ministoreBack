"use strict";

import db from "../models/index.js";
import { badRequest, round3 } from "../utils/http.js";

/**
 * The only way stock levels change. Locks the product's
 * inventory row, applies `delta`, and records a stock movement,
 * all inside the caller's transaction.
 *
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.productId
 * @param {number} [args.delta]          signed quantity (+ in, - out)
 * @param {number} [args.setTo]          stocktake: set quantity to this value instead
 * @param {string} args.type             STOCK_MOVEMENT_TYPES value
 * @param {string} args.userId
 * @param {object} args.transaction      Sequelize transaction (required)
 * @param {boolean} [args.allowNegative] let stock drop below zero
 * @param {string} [args.productName]    for error messages
 */
export const applyStockChange = async ({
    tenantId,
    productId,
    delta,
    setTo,
    type,
    userId,
    transaction,
    allowNegative = false,
    productName,
    unitCost = null,
    referenceType = null,
    referenceId = null,
    supplierId = null,
    note = null,
}) => {
    if (!transaction) {
        throw new Error("applyStockChange must run inside a transaction");
    }

    let row = await db.inventory.findOne({
        where: { tenantId, productId },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (!row) {
        // Products created before the inventory module have no row yet.
        row = await db.inventory.create(
            { tenantId, productId, quantity: 0 },
            { transaction }
        );
    }

    const current = Number(row.quantity);
    const change = setTo !== undefined ? round3(Number(setTo) - current) : round3(Number(delta));
    const balanceAfter = round3(current + change);

    if (balanceAfter < 0 && !allowNegative) {
        throw badRequest(
            `Not enough stock for ${productName || "this product"}. Available: ${current}`,
            { productId, available: current }
        );
    }

    await row.update({ quantity: balanceAfter }, { transaction });

    const movement = await db.stockMovement.create(
        {
            tenantId,
            productId,
            type,
            quantity: change,
            balanceAfter,
            unitCost,
            referenceType,
            referenceId,
            supplierId,
            note,
            userId,
        },
        { transaction }
    );

    return { inventory: row, movement, balanceAfter };
};
