"use strict";

import { v4 as uuidv4 } from "uuid";
import db from "../../models/index.js";
import { applyStockChange } from "../../services/stock.js";
import { tenantModules } from "../../services/auth.js";
import { MODULES, PERMISSIONS } from "../../config/permissions.js";
import { has } from "../../middleware/auth/authorize.js";
import { STOCK_MOVEMENT_TYPES } from "../../models/stockMovement.js";
import { UNREGISTERED_STATUS, matchKeyFor } from "../../models/unregisteredItem.js";

const {
    sequelize,
    sales,
    salesItems,
    product,
    productdetails,
    productbarcode,
    unregisteredItem,
} = db;

export default async (req, res) => {
    try {
        const date = new Date();

        const {
            invoiceNumber,
            customerName,
            customerMobile,
            paymentMethod,
            subtotal,
            tax,
            total,
            paidNow,
            cashGiven,
            changeAmount,
            status,
            items,
            loanDueDate,
        } = req.body;

        // The cashier is whoever is logged in - never trust a
        // userId sent by the browser.
        const userId = req.user.id;
        const tenantId = req.tenantId;
        const modules = tenantModules(req.tenant);

        // =====================================================
        // VALIDATE MODELS
        // =====================================================

        if (!sequelize) {
            throw new Error(
                "Sequelize instance is not initialized"
            );
        }

        if (!sales) {
            throw new Error(
                "Sales model is not initialized"
            );
        }

        if (!salesItems) {
            throw new Error(
                "Sales items model is not initialized"
            );
        }

        if (!product) {
            throw new Error(
                "Product model is not initialized"
            );
        }

        // =====================================================
        // VALIDATE SALE HEADER
        // =====================================================

        if (
            !invoiceNumber ||
            !String(invoiceNumber).trim()
        ) {
            return res.status(400).json({
                successful: false,
                message: "Invoice number is required",
            });
        }

        if (!userId) {
            return res.status(400).json({
                successful: false,
                message: "User ID is required",
            });
        }

        if (!paymentMethod) {
            return res.status(400).json({
                successful: false,
                message: "Payment method is required",
            });
        }

        if (
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "At least one sale item is required",
            });
        }

        // =====================================================
        // NORMALIZE HEADER
        // =====================================================

        const cleanInvoiceNumber =
            String(invoiceNumber).trim();

        const cleanPaymentMethod =
            String(paymentMethod)
                .trim()
                .toLowerCase();

        const cleanStatus =
            String(status || "completed")
                .trim()
                .toLowerCase();

        const cleanCustomerName =
            customerName !== undefined &&
            customerName !== null &&
            String(customerName).trim() !== ""
                ? String(customerName).trim()
                : null;

        const cleanCustomerMobile =
            customerMobile !== undefined &&
            customerMobile !== null &&
            String(customerMobile).trim() !== ""
                ? String(customerMobile).trim()
                : null;

        const cleanTax =
            tax !== undefined &&
            tax !== null &&
            tax !== ""
                ? Number(tax)
                : 0;

        const suppliedSubtotal =
            subtotal !== undefined &&
            subtotal !== null &&
            subtotal !== ""
                ? Number(subtotal)
                : null;

        const suppliedTotal =
            total !== undefined &&
            total !== null &&
            total !== ""
                ? Number(total)
                : null;

        const cleanPaidNow =
            paidNow !== undefined &&
            paidNow !== null &&
            paidNow !== ""
                ? Number(paidNow)
                : null;

        const cleanCashGiven =
            cashGiven !== null &&
            cashGiven !== undefined &&
            cashGiven !== ""
                ? Number(cashGiven)
                : null;

        const suppliedChangeAmount =
            changeAmount !== null &&
            changeAmount !== undefined &&
            changeAmount !== ""
                ? Number(changeAmount)
                : null;

        // =====================================================
        // VALIDATE TAX
        // =====================================================

        if (
            !Number.isFinite(cleanTax) ||
            cleanTax < 0
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Tax must be a valid number",
            });
        }

        // =====================================================
        // VALIDATE CLIENT TOTALS IF PROVIDED
        // =====================================================

        if (
            suppliedSubtotal !== null &&
            !Number.isFinite(suppliedSubtotal)
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Subtotal must be a valid number",
            });
        }

        if (
            suppliedTotal !== null &&
            !Number.isFinite(suppliedTotal)
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Total must be a valid number",
            });
        }

        // =====================================================
        // VALIDATE PAID NOW
        // =====================================================

        if (
            cleanPaidNow !== null &&
            (
                !Number.isFinite(cleanPaidNow) ||
                cleanPaidNow < 0
            )
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Paid now must be a valid number greater than or equal to 0",
            });
        }

        // =====================================================
        // VALIDATE CHANGE AMOUNT
        // =====================================================

        if (
            suppliedChangeAmount !== null &&
            (
                !Number.isFinite(
                    suppliedChangeAmount
                ) ||
                suppliedChangeAmount < 0
            )
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Change amount must be a valid number",
            });
        }

        // =====================================================
        // PAYMENT METHOD
        // =====================================================

        const allowedPaymentMethods = [
            "cash",
            "card",
            "mobile",
            "loan",
        ];

        if (
            !allowedPaymentMethods.includes(
                cleanPaymentMethod
            )
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Invalid payment method. Allowed: cash, card, mobile, loan",
            });
        }

        if (
            cleanPaymentMethod === "loan" &&
            !modules.includes(MODULES.LOANS)
        ) {
            return res.status(403).json({
                successful: false,
                code: "PLAN_MODULE",
                message:
                    "Loan sales are not included in your subscription plan",
            });
        }

        const cleanLoanDueDate =
            cleanPaymentMethod === "loan" &&
            typeof loanDueDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(loanDueDate)
                ? loanDueDate
                : null;

        // =====================================================
        // LOAN CUSTOMER VALIDATION
        // =====================================================

        if (
            cleanPaymentMethod === "loan" &&
            !cleanCustomerName &&
            !cleanCustomerMobile
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Customer name or customer mobile is required for loan sales",
            });
        }

        // =====================================================
        // DUPLICATE INVOICE
        // =====================================================

        const existingSale =
            await sales.findOne({
                where: {
                    tenantId,
                    invoiceNumber:
                        cleanInvoiceNumber,
                },
                raw: true,
            });

        if (existingSale) {
            return res.status(409).json({
                successful: false,
                message:
                    "Invoice number already exists",
            });
        }

        // =====================================================
        // VALIDATE ITEMS BEFORE TRANSACTION
        // =====================================================

        for (const item of items) {

            // Manual item: sold by name/price, not in the product list.
            if (item.manual) {
                if (
                    !item.productName ||
                    !String(item.productName).trim()
                ) {
                    return res.status(400).json({
                        successful: false,
                        message:
                            "Items not in the system need a name",
                    });
                }

                if (!(Number(item.unitPrice) > 0)) {
                    return res.status(400).json({
                        successful: false,
                        message:
                            `Enter a selling price for ${String(item.productName).trim()}`,
                    });
                }

                if (
                    item.costPrice !== undefined &&
                    item.costPrice !== null &&
                    item.costPrice !== "" &&
                    !(Number(item.costPrice) >= 0)
                ) {
                    return res.status(400).json({
                        successful: false,
                        message:
                            `Cost price for ${String(item.productName).trim()} must be 0 or more`,
                    });
                }
            } else if (!item.productId) {
                return res.status(400).json({
                    successful: false,
                    message:
                        "Every sale item must have a productId",
                });
            }

            const quantity =
                Number(item.quantity);

            const unitPrice =
                Number(item.unitPrice);

            if (
                !Number.isFinite(quantity) ||
                quantity <= 0
            ) {
                return res.status(400).json({
                    successful: false,
                    message:
                        "Every item must have a valid quantity",
                });
            }

            if (
                !Number.isFinite(unitPrice) ||
                unitPrice < 0
            ) {
                return res.status(400).json({
                    successful: false,
                    message:
                        "Every item must have a valid unit price",
                });
            }

        }

        // =====================================================
        // CREATE SALE + SALE ITEMS
        // =====================================================

        const result =
            await sequelize.transaction(
                async (transaction) => {

                    const saleId = uuidv4();

                    // -------------------------------------------------
                    // LINE RESOLVERS
                    // -------------------------------------------------

                    const resolveProductLine = async (item, unitPrice) => {
                        const existingProduct =
                            await product.findOne({
                                where: {
                                    id: item.productId,
                                    tenantId,
                                },
                                include: [
                                    {
                                        model: productdetails,
                                        as: "details",
                                        required: false,
                                    },
                                ],
                                transaction,
                            });

                        if (!existingProduct) {
                            throw new Error(
                                `Product not found: ${item.productId}`
                            );
                        }

                        const minimumPrice =
                            Number(
                                existingProduct.details?.minimumSellingPrice || 0
                            );

                        if (
                            minimumPrice > 0 &&
                            unitPrice < minimumPrice
                        ) {
                            throw new Error(
                                `Price for ${existingProduct.itemName} is below the minimum selling price of ${minimumPrice}`
                            );
                        }

                        // Cost comes from the product record, not
                        // the browser, so profit cannot be faked.
                        return {
                            productId: existingProduct.id,
                            unregisteredItemId: null,
                            costPrice: Number(existingProduct.details?.costPrice || 0),
                            name: item.productName || existingProduct.itemName,
                        };
                    };

                    // Records the item for a manager to register later.
                    // Repeat sales of the same item add up on one row.
                    const resolveManualLine = async (item, quantity, unitPrice) => {
                        const name = String(item.productName).trim();

                        const barcode =
                            item.barcode && String(item.barcode).trim()
                                ? String(item.barcode).trim()
                                : null;

                        const cost =
                            item.costPrice !== undefined &&
                            item.costPrice !== null &&
                            item.costPrice !== ""
                                ? Number(item.costPrice)
                                : null;

                        if (barcode) {
                            const known = await productbarcode.findOne({
                                where: { tenantId, barcode },
                                transaction,
                            });

                            if (known) {
                                const owner = await product.findByPk(known.productId, { transaction });

                                throw new Error(
                                    `Barcode ${barcode} belongs to ${owner?.itemName || "a registered product"}. Add it from the product search`
                                );
                            }
                        }

                        const matchKey = matchKeyFor({ barcode, name });

                        let row = await unregisteredItem.findOne({
                            where: {
                                tenantId,
                                matchKey,
                                status: UNREGISTERED_STATUS.PENDING,
                            },
                            transaction,
                            lock: transaction.LOCK.UPDATE,
                        });

                        if (row) {
                            await row.update(
                                {
                                    sellingPrice: unitPrice,
                                    costPrice: cost ?? row.costPrice,
                                    quantitySold: Number(row.quantitySold) + quantity,
                                    timesSold: row.timesSold + 1,
                                    lastSoldAt: date,
                                },
                                { transaction }
                            );
                        } else {
                            row = await unregisteredItem.create(
                                {
                                    tenantId,
                                    name,
                                    barcode,
                                    matchKey,
                                    sellingPrice: unitPrice,
                                    costPrice: cost,
                                    quantitySold: quantity,
                                    timesSold: 1,
                                    lastSoldAt: date,
                                    status: UNREGISTERED_STATUS.PENDING,
                                    createdBy: userId,
                                },
                                { transaction }
                            );
                        }

                        return {
                            productId: null,
                            unregisteredItemId: row.id,
                            costPrice: cost,
                            name,
                        };
                    };

                    // =================================================
                    // CALCULATE SALE TOTALS
                    // =================================================

                    let calculatedSubtotal = 0;
                    let totalProfit = 0;
                    let totalQuantity = 0;

                    const normalizedItems = [];

                    // =================================================
                    // PROCESS ITEMS
                    // =================================================

                    for (const item of items) {

                        const quantity =
                            Number(item.quantity);

                        const unitPrice =
                            Number(item.unitPrice);

                        // Product line or manual (unregistered) line.
                        const line =
                            item.manual
                                ? await resolveManualLine(item, quantity, unitPrice)
                                : await resolveProductLine(item, unitPrice);

                        // NULL when a manual item has no cost entered:
                        // its profit is unknown, counted as 0.
                        const costPrice =
                            line.costPrice;

                        // ---------------------------------------------
                        // CALCULATE ITEM SUBTOTAL
                        // ---------------------------------------------

                        const itemSubtotal =
                            quantity *
                            unitPrice;

                        // ---------------------------------------------
                        // CALCULATE ITEM PROFIT
                        // ---------------------------------------------

                        const itemProfit =
                            costPrice === null
                                ? 0
                                : (
                                    unitPrice -
                                    costPrice
                                ) *
                                quantity;

                        // ---------------------------------------------
                        // ADD TO SALE TOTALS
                        // ---------------------------------------------

                        calculatedSubtotal +=
                            itemSubtotal;

                        totalProfit +=
                            itemProfit;

                        totalQuantity +=
                            quantity;

                        // ---------------------------------------------
                        // OPTIONAL CLIENT SUBTOTAL CHECK
                        // ---------------------------------------------

                        if (
                            item.subtotal !== undefined &&
                            item.subtotal !== null &&
                            item.subtotal !== ""
                        ) {

                            const suppliedItemSubtotal =
                                Number(
                                    item.subtotal
                                );

                            if (
                                !Number.isFinite(
                                    suppliedItemSubtotal
                                )
                            ) {
                                throw new Error(
                                    `Invalid subtotal for ${line.name}`
                                );
                            }

                            if (
                                Math.abs(
                                    suppliedItemSubtotal -
                                    itemSubtotal
                                ) > 0.01
                            ) {
                                throw new Error(
                                    `Invalid subtotal for ${line.name}. Expected ${itemSubtotal}, received ${suppliedItemSubtotal}`
                                );
                            }
                        }

                        normalizedItems.push({
                            id:
                                uuidv4(),

                            saleId:
                                saleId,

                            tenantId,

                            productId:
                                line.productId,

                            unregisteredItemId:
                                line.unregisteredItemId,

                            sku:
                                item.sku ||
                                null,

                            barcode:
                                item.barcode ||
                                null,

                            productName:
                                line.name,

                            quantity:
                                quantity,

                            unitPrice:
                                unitPrice,

                            costPrice:
                                costPrice,

                            subtotal:
                                itemSubtotal,

                            profit:
                                itemProfit,
                        });
                    }

                    // =================================================
                    // ROUND CALCULATED VALUES
                    // =================================================

                    calculatedSubtotal =
                        Number(
                            calculatedSubtotal.toFixed(2)
                        );

                    totalProfit =
                        Number(
                            totalProfit.toFixed(2)
                        );

                    // =================================================
                    // CALCULATE TOTAL
                    //
                    // Total = Subtotal + Tax
                    // =================================================

                    const calculatedTotal =
                        Number(
                            (
                                calculatedSubtotal +
                                cleanTax
                            ).toFixed(2)
                        );

                    // =================================================
                    // OPTIONAL HEADER SUBTOTAL CHECK
                    // =================================================

                    if (
                        suppliedSubtotal !== null &&
                        Math.abs(
                            suppliedSubtotal -
                            calculatedSubtotal
                        ) > 0.01
                    ) {
                        throw new Error(
                            `Invalid sale subtotal. Expected ${calculatedSubtotal}, received ${suppliedSubtotal}`
                        );
                    }

                    // =================================================
                    // OPTIONAL HEADER TOTAL CHECK
                    // =================================================

                    if (
                        suppliedTotal !== null &&
                        Math.abs(
                            suppliedTotal -
                            calculatedTotal
                        ) > 0.01
                    ) {
                        throw new Error(
                            `Invalid sale total. Expected ${calculatedTotal}, received ${suppliedTotal}`
                        );
                    }

                    // =================================================
                    // CALCULATE PAID NOW
                    // =================================================

                    let calculatedPaidNow = 0;

                    // ---------------------------------------------
                    // LOAN
                    // ---------------------------------------------

                    if (
                        cleanPaymentMethod === "loan"
                    ) {

                        // If omitted, a loan defaults to 0 paid now.
                        calculatedPaidNow =
                            cleanPaidNow !== null
                                ? Number(
                                    cleanPaidNow.toFixed(2)
                                )
                                : 0;

                        // Cannot pay more than the full sale.
                        if (
                            calculatedPaidNow >
                            calculatedTotal
                        ) {
                            throw new Error(
                                `Paid now cannot be greater than the sale total. Total: ${calculatedTotal}, paid now: ${calculatedPaidNow}`
                            );
                        }
                    }

                    // ---------------------------------------------
                    // CASH
                    // ---------------------------------------------

                    else if (
                        cleanPaymentMethod === "cash"
                    ) {

                        if (
                            cleanCashGiven === null ||
                            !Number.isFinite(
                                cleanCashGiven
                            )
                        ) {
                            throw new Error(
                                "Cash given is required for cash payments"
                            );
                        }

                        if (
                            cleanCashGiven <
                            calculatedTotal
                        ) {
                            throw new Error(
                                "Cash given is less than the sale total"
                            );
                        }

                        calculatedPaidNow =
                            calculatedTotal;
                    }

                    // ---------------------------------------------
                    // CARD / MOBILE
                    // ---------------------------------------------

                    else {

                        // Card/mobile are full payments.
                        calculatedPaidNow =
                            calculatedTotal;
                    }

                    // =================================================
                    // VALIDATE PAID NOW
                    // =================================================

                    if (
                        calculatedPaidNow < 0 ||
                        calculatedPaidNow >
                        calculatedTotal
                    ) {
                        throw new Error(
                            `Invalid paid now amount. Expected a value between 0 and ${calculatedTotal}`
                        );
                    }

                    calculatedPaidNow =
                        Number(
                            calculatedPaidNow.toFixed(2)
                        );

                    // =================================================
                    // CALCULATE CHANGE
                    // =================================================

                    let calculatedChangeAmount = 0;

                    // ---------------------------------------------
                    // CASH
                    // ---------------------------------------------

                    if (
                        cleanPaymentMethod === "cash"
                    ) {

                        calculatedChangeAmount =
                            Number(
                                (
                                    cleanCashGiven -
                                    calculatedTotal
                                ).toFixed(2)
                            );
                    }

                    // ---------------------------------------------
                    // NON-CASH
                    // ---------------------------------------------

                    else {

                        // Card, mobile and loan must not contain
                        // cash given.
                        if (
                            cleanCashGiven !== null &&
                            cleanCashGiven !== 0
                        ) {
                            throw new Error(
                                "Cash given should only be provided for cash payments"
                            );
                        }

                        calculatedChangeAmount = 0;
                    }

                    // =================================================
                    // OPTIONAL CHANGE CHECK
                    // =================================================

                    if (
                        suppliedChangeAmount !== null &&
                        Math.abs(
                            suppliedChangeAmount -
                            calculatedChangeAmount
                        ) > 0.01
                    ) {
                        throw new Error(
                            `Invalid change amount. Expected ${calculatedChangeAmount}, received ${suppliedChangeAmount}`
                        );
                    }

                    // =================================================
                    // CALCULATE REMAINING BALANCE
                    // =================================================

                    const remainingBalance =
                        Number(
                            (
                                calculatedTotal -
                                calculatedPaidNow
                            ).toFixed(2)
                        );

                    // =================================================
                    // CREATE SALE
                    // =================================================

                    const createdSale =
                        await sales.create(
                            {
                                id:
                                    saleId,

                                tenantId,

                                invoiceNumber:
                                    cleanInvoiceNumber,

                                customerName:
                                    cleanCustomerName,

                                customerMobile:
                                    cleanCustomerMobile,

                                userId:
                                    userId,

                                paymentMethod:
                                    cleanPaymentMethod,

                                subtotal:
                                    calculatedSubtotal,

                                tax:
                                    cleanTax,

                                // Full sale amount.
                                // Loan does NOT reduce this.
                                total:
                                    calculatedTotal,

                                // Actual amount paid now.
                                paidNow:
                                    calculatedPaidNow,

                                cashGiven:
                                    cleanPaymentMethod === "cash"
                                        ? cleanCashGiven
                                        : null,

                                changeAmount:
                                    calculatedChangeAmount,

                                status:
                                    cleanStatus,

                                loanDueDate:
                                    cleanLoanDueDate,

                                createdAt:
                                    date,

                                updatedAt:
                                    date,
                            },
                            {
                                transaction,
                            }
                        );

                    // =================================================
                    // CREATE SALE ITEMS
                    // =================================================

                    const createdItems = [];

                    for (
                        const item
                        of normalizedItems
                    ) {

                        const createdItem =
                            await salesItems.create(
                                {
                                    ...item,

                                    createdAt:
                                        date,

                                    updatedAt:
                                        date,
                                },
                                {
                                    transaction,
                                }
                            );

                        createdItems.push(
                            createdItem
                        );

                        // ---------------------------------------------
                        // DEDUCT STOCK
                        // ---------------------------------------------

                        // Manual items have no stock record.
                        if (
                            item.productId &&
                            modules.includes(MODULES.INVENTORY)
                        ) {
                            await applyStockChange({
                                tenantId,
                                productId: item.productId,
                                delta: -Number(item.quantity),
                                type: STOCK_MOVEMENT_TYPES.SALE,
                                userId,
                                allowNegative:
                                    Boolean(req.tenant?.allowNegativeStock),
                                productName: item.productName,
                                unitCost: item.costPrice,
                                referenceType: "sale",
                                referenceId: saleId,
                                note: cleanInvoiceNumber,
                                transaction,
                            });
                        }
                    }

                    // =================================================
                    // RETURN
                    // =================================================

                    return {
                        sale:
                            createdSale,

                        items:
                            createdItems,

                        totalProfit:
                            totalProfit,

                        totalQuantity:
                            totalQuantity,

                        calculatedSubtotal:
                            calculatedSubtotal,

                        calculatedTotal:
                            calculatedTotal,

                        calculatedPaidNow:
                            calculatedPaidNow,

                        remainingBalance:
                            remainingBalance,
                    };
                }
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json(hideProfit(req, {
            successful: true,

            message:
                "Sale registered successfully",

            saleId:
                result.sale.id,

            invoiceNumber:
                result.sale.invoiceNumber,

            data: {
                id:
                    result.sale.id,

                invoiceNumber:
                    result.sale.invoiceNumber,

                customerName:
                    result.sale.customerName,

                customerMobile:
                    result.sale.customerMobile,

                userId:
                    result.sale.userId,

                paymentMethod:
                    result.sale.paymentMethod,

                subtotal:
                    Number(
                        result.calculatedSubtotal
                    ),

                tax:
                    Number(
                        result.sale.tax
                    ),

                // Full sale amount.
                total:
                    Number(
                        result.calculatedTotal
                    ),

                // Amount paid immediately.
                paidNow:
                    Number(
                        result.calculatedPaidNow
                    ),

                // Amount still owed.
                remainingBalance:
                    Number(
                        result.remainingBalance
                    ),

                totalQuantity:
                    Number(
                        result.totalQuantity
                    ),

                totalProfit:
                    Number(
                        result.totalProfit
                    ),

                cashGiven:
                    result.sale.cashGiven !== null
                        ? Number(
                            result.sale.cashGiven
                        )
                        : null,

                changeAmount:
                    Number(
                        result.sale.changeAmount
                    ),

                status:
                    result.sale.status,

                createdAt:
                    result.sale.createdAt,

                updatedAt:
                    result.sale.updatedAt,

                items:
                    result.items.map(
                        (item) => ({
                            id:
                                item.id,

                            saleId:
                                item.saleId,

                            productId:
                                item.productId,

                            sku:
                                item.sku,

                            barcode:
                                item.barcode,

                            productName:
                                item.productName,

                            quantity:
                                Number(
                                    item.quantity
                                ),

                            unitPrice:
                                Number(
                                    item.unitPrice
                                ),

                            costPrice:
                                Number(
                                    item.costPrice
                                ),

                            subtotal:
                                Number(
                                    item.subtotal
                                ),

                            profit:
                                Number(
                                    item.profit
                                ),
                        })
                    ),
            },
        }));

    } catch (error) {

        // =====================================================
        // ERROR
        // =====================================================

        console.error(
            "Sale registration error:",
            error
        );

        if (error.status && error.status < 500) {
            return res.status(error.status).json({
                successful: false,
                message: error.message,
                ...error.extra,
            });
        }

        // =====================================================
        // SEQUELIZE VALIDATION ERROR
        // =====================================================

        if (
            error.name ===
            "SequelizeValidationError"
        ) {
            return res.status(400).json({
                successful: false,

                message:
                    "Sale validation failed",

                errors:
                    error.errors.map(
                        (item) => ({
                            field:
                                item.path,

                            message:
                                item.message,
                        })
                    ),
            });
        }

        // =====================================================
        // SEQUELIZE UNIQUE ERROR
        // =====================================================

        if (
            error.name ===
            "SequelizeUniqueConstraintError"
        ) {
            return res.status(409).json({
                successful: false,

                message:
                    "Invoice number already exists",

                errors:
                    error.errors?.map(
                        (item) => ({
                            field:
                                item.path,

                            message:
                                item.message,
                        })
                    ),
            });
        }

        // =====================================================
        // CLIENT/SALE VALIDATION ERRORS
        // =====================================================

        const validationMessages = [
            "Invalid sale subtotal",
            "Invalid sale total",
            "Invalid change amount",
            "Invalid subtotal for",
            "Cash given is required",
            "Cash given is less than the sale total",
            "Cash given should only be provided",
            "Product not found",
            "Paid now must be a valid number",
            "Paid now cannot be greater than the sale total",
            "Invalid paid now amount",
            "Customer name or customer mobile is required for loan sales",
            "is below the minimum selling price",
            "Add it from the product search",
        ];

        const isValidationError =
            validationMessages.some(
                (message) =>
                    error.message?.includes(
                        message
                    )
            );

        if (isValidationError) {
            return res.status(400).json({
                successful: false,

                message:
                    error.message,
            });
        }

        // =====================================================
        // GENERIC ERROR
        // =====================================================

        return res.status(500).json({
            successful: false,

            message:
                "Failed to register sale",

            error:
                error.message ||
                "Failed to register sale",
        });
    }
};

// Cashiers see what they sold, not what it cost the store.
function hideProfit(req, body) {
    if (has(req, PERMISSIONS.SALES_VIEW_PROFIT)) {
        return body;
    }

    delete body.data.totalProfit;

    body.data.items = body.data.items.map(
        ({ costPrice, profit, ...item }) => item
    );

    return body;
}
