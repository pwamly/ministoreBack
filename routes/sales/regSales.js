"use strict";

import { v4 as uuidv4 } from "uuid";
import db from "../../models/index.js";

const {
    sequelize,
    sales,
    salesItems,
    product,
} = db;

export default async (req, res) => {
    try {
        const date = new Date();

        const {
            invoiceNumber,
            customerName,
            userId,
            paymentMethod,
            subtotal,
            tax,
            total,
            cashGiven,
            changeAmount,
            status,
            items,
        } = req.body;

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

        // Tax can still come from the client.
        // Subtotal and total will be calculated by the server.
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
        ];

        if (
            !allowedPaymentMethods.includes(
                cleanPaymentMethod
            )
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Invalid payment method. Allowed: cash, card, mobile",
            });
        }

        // =====================================================
        // DUPLICATE INVOICE
        // =====================================================

        const existingSale =
            await sales.findOne({
                where: {
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
            if (!item.productId) {
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

            const costPrice =
                Number(item.costPrice);

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

            if (
                !Number.isFinite(costPrice) ||
                costPrice < 0
            ) {
                return res.status(400).json({
                    successful: false,
                    message:
                        "Every item must have a valid cost price",
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

                    // =================================================
                    // CALCULATE SALE TOTALS FROM ITEMS
                    // =================================================

                    let calculatedSubtotal = 0;
                    let totalProfit = 0;
                    let totalQuantity = 0;

                    const normalizedItems = [];

                    // =================================================
                    // PROCESS ITEMS
                    // =================================================

                    for (const item of items) {

                        // ---------------------------------------------
                        // VERIFY PRODUCT
                        // ---------------------------------------------

                        const existingProduct =
                            await product.findOne({
                                where: {
                                    id: item.productId,
                                },
                                transaction,
                            });

                        if (!existingProduct) {
                            throw new Error(
                                `Product not found: ${item.productId}`
                            );
                        }

                        // ---------------------------------------------
                        // NORMALIZE ITEM
                        // ---------------------------------------------

                        const quantity =
                            Number(item.quantity);

                        const unitPrice =
                            Number(item.unitPrice);

                        const costPrice =
                            Number(item.costPrice);

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
                            (
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
                                    `Invalid subtotal for product ${item.productId}`
                                );
                            }

                            if (
                                Math.abs(
                                    suppliedItemSubtotal -
                                    itemSubtotal
                                ) > 0.01
                            ) {
                                throw new Error(
                                    `Invalid subtotal for product ${item.productId}. Expected ${itemSubtotal}, received ${suppliedItemSubtotal}`
                                );
                            }
                        }

                        normalizedItems.push({
                            id: uuidv4(),

                            saleId: saleId,

                            productId:
                                item.productId,

                            sku:
                                item.sku ||
                                null,

                            barcode:
                                item.barcode ||
                                null,

                            productName:
                                item.productName ||
                                null,

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
                    // CALCULATE CHANGE
                    // =================================================

                    let calculatedChangeAmount = 0;

                    if (
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

                        calculatedChangeAmount =
                            Number(
                                (
                                    cleanCashGiven -
                                    calculatedTotal
                                ).toFixed(2)
                            );

                    } else {

                        // Card/mobile should not have cash given.
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
                    // CREATE SALE
                    // =================================================

                    const createdSale =
                        await sales.create(
                            {
                                id:
                                    saleId,

                                invoiceNumber:
                                    cleanInvoiceNumber,

                                customerName:
                                    customerName
                                        ? String(
                                            customerName
                                        ).trim()
                                        : null,

                                userId:
                                    userId,

                                paymentMethod:
                                    cleanPaymentMethod,

                                // IMPORTANT:
                                // Use calculated subtotal.
                                subtotal:
                                    calculatedSubtotal,

                                tax:
                                    cleanTax,

                                // IMPORTANT:
                                // Use calculated total.
                                total:
                                    calculatedTotal,

                                cashGiven:
                                    cleanPaymentMethod === "cash"
                                        ? cleanCashGiven
                                        : null,

                                // IMPORTANT:
                                // Use calculated change.
                                changeAmount:
                                    calculatedChangeAmount,

                                status:
                                    cleanStatus,

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
                    };
                }
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({
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

                total:
                    Number(
                        result.calculatedTotal
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
        });

    } catch (error) {

        // =====================================================
        // ERROR
        // =====================================================

        console.error(
            "Sale registration error:",
            error
        );

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
            "Invalid subtotal for product",
            "Cash given is required",
            "Cash given is less than the sale total",
            "Cash given should only be provided",
            "Product not found",
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
