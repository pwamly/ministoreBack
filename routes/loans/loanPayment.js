"use strict";

import { v4 as uuidv4 } from "uuid";
import db from "../../models/index.js";

const {
    sequelize,
    sales,
    loanPayments,
} = db;

export default async (req, res) => {
    try {
        const {
            saleId,
            amount,
            paymentMethod,
            userId,
            note,
            paidAt,
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

        if (!loanPayments) {
            throw new Error(
                "Loan payments model is not initialized"
            );
        }

        // =====================================================
        // REQUIRED FIELDS
        // =====================================================

        if (!saleId) {
            return res.status(400).json({
                successful: false,
                message: "Sale ID is required",
            });
        }

        if (!userId) {
            return res.status(400).json({
                successful: false,
                message: "User ID is required",
            });
        }

        if (
            amount === undefined ||
            amount === null ||
            amount === ""
        ) {
            return res.status(400).json({
                successful: false,
                message: "Payment amount is required",
            });
        }

        // =====================================================
        // NORMALIZE
        // =====================================================

        const cleanAmount =
            Number(amount);

        const cleanPaymentMethod =
            String(
                paymentMethod || "cash"
            )
                .trim()
                .toLowerCase();

        const cleanNote =
            note !== undefined &&
            note !== null &&
            String(note).trim() !== ""
                ? String(note).trim()
                : null;

        // =====================================================
        // VALIDATE AMOUNT
        // =====================================================

        if (
            !Number.isFinite(cleanAmount) ||
            cleanAmount <= 0
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Payment amount must be greater than 0",
            });
        }

        const roundedAmount =
            Number(
                cleanAmount.toFixed(2)
            );

        // =====================================================
        // VALIDATE PAYMENT METHOD
        // =====================================================

        const allowedPaymentMethods = [
            "cash",
            "card",
            "mobile",
            "bank",
        ];

        if (
            !allowedPaymentMethods.includes(
                cleanPaymentMethod
            )
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Invalid payment method. Allowed: cash, card, mobile, bank",
            });
        }

        // =====================================================
        // FIND SALE
        // =====================================================

        const sale =
            await sales.findOne({
                where: {
                    id: saleId,
                },
            });

        if (!sale) {
            return res.status(404).json({
                successful: false,
                message: "Sale not found",
            });
        }

        // =====================================================
        // VERIFY LOAN SALE
        // =====================================================

        if (
            String(
                sale.paymentMethod
            ).toLowerCase() !== "loan"
        ) {
            return res.status(400).json({
                successful: false,
                message:
                    "Payment can only be made against a loan sale",
            });
        }

        // =====================================================
        // TRANSACTION
        // =====================================================

        const result =
            await sequelize.transaction(
                async (transaction) => {

                    // ---------------------------------------------
                    // LOCK SALE
                    // ---------------------------------------------

                    const lockedSale =
                        await sales.findOne({
                            where: {
                                id: saleId,
                            },

                            transaction,

                            lock:
                                transaction.LOCK.UPDATE,
                        });

                    if (!lockedSale) {
                        throw new Error(
                            "Sale not found"
                        );
                    }

                    // ---------------------------------------------
                    // SALE TOTAL
                    // ---------------------------------------------

                    const saleTotal =
                        Number(
                            lockedSale.total || 0
                        );

                    // ---------------------------------------------
                    // CURRENT PAID AMOUNT
                    // ---------------------------------------------
                    //
                    // sales.paidNow is the cumulative amount
                    // already paid against this sale.
                    //

                    const currentPaid =
                        Number(
                            lockedSale.paidNow || 0
                        );

                    // ---------------------------------------------
                    // CURRENT OUTSTANDING
                    // ---------------------------------------------

                    const currentOutstanding =
                        Number(
                            Math.max(
                                saleTotal -
                                    currentPaid,
                                0
                            ).toFixed(2)
                        );

                    // ---------------------------------------------
                    // ALREADY PAID
                    // ---------------------------------------------

                    if (
                        currentOutstanding <= 0
                    ) {
                        throw new Error(
                            "This loan has already been fully paid"
                        );
                    }

                    // ---------------------------------------------
                    // PREVENT OVERPAYMENT
                    // ---------------------------------------------

                    if (
                        roundedAmount >
                        currentOutstanding
                    ) {
                        throw new Error(
                            `Payment exceeds outstanding balance. Outstanding: ${currentOutstanding}`
                        );
                    }

                    // ---------------------------------------------
                    // NEW PAID AMOUNT
                    // ---------------------------------------------

                    const newPaid =
                        Number(
                            (
                                currentPaid +
                                roundedAmount
                            ).toFixed(2)
                        );

                    // ---------------------------------------------
                    // NEW OUTSTANDING
                    // ---------------------------------------------

                    const newOutstanding =
                        Number(
                            Math.max(
                                saleTotal -
                                    newPaid,
                                0
                            ).toFixed(2)
                        );

                    // ---------------------------------------------
                    // CREATE PAYMENT RECORD
                    // ---------------------------------------------

                    const payment =
                        await loanPayments.create(
                            {
                                id:
                                    uuidv4(),

                                saleId:
                                    saleId,

                                amount:
                                    roundedAmount,

                                paymentMethod:
                                    cleanPaymentMethod,

                                userId:
                                    userId,

                                note:
                                    cleanNote,

                                paidAt:
                                    paidAt
                                        ? new Date(
                                            paidAt
                                        )
                                        : new Date(),

                                createdAt:
                                    new Date(),

                                updatedAt:
                                    new Date(),
                            },
                            {
                                transaction,
                            }
                        );

                    // ---------------------------------------------
                    // UPDATE SALE
                    // ---------------------------------------------

                    await lockedSale.update(
                        {
                            paidNow:
                                newPaid,

                            updatedAt:
                                new Date(),
                        },
                        {
                            transaction,
                        }
                    );

                    // ---------------------------------------------
                    // STATUS
                    // ---------------------------------------------

                    const loanStatus =
                        newOutstanding <= 0
                            ? "paid"
                            : "partial";

                    return {
                        payment,
                        sale:
                            lockedSale,
                        saleTotal,
                        currentPaid,
                        paymentAmount:
                            roundedAmount,
                        newPaid,
                        newOutstanding,
                        loanStatus,
                    };
                }
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(201).json({
            successful: true,

            message:
                "Loan payment recorded successfully",

            data: {
                payment: {
                    id:
                        result.payment.id,

                    saleId:
                        result.payment.saleId,

                    amount:
                        Number(
                            result.payment.amount
                        ),

                    paymentMethod:
                        result.payment.paymentMethod,

                    userId:
                        result.payment.userId,

                    note:
                        result.payment.note,

                    paidAt:
                        result.payment.paidAt,

                    createdAt:
                        result.payment.createdAt,

                    updatedAt:
                        result.payment.updatedAt,
                },

                loan: {
                    saleId:
                        result.sale.id,

                    invoiceNumber:
                        result.sale.invoiceNumber,

                    total:
                        Number(
                            result.saleTotal
                        ),

                    previousPaid:
                        Number(
                            result.currentPaid
                        ),

                    payment:
                        Number(
                            result.paymentAmount
                        ),

                    paidNow:
                        Number(
                            result.newPaid
                        ),

                    remainingBalance:
                        Number(
                            result.newOutstanding
                        ),

                    loanStatus:
                        result.loanStatus,
                },
            },
        });

    } catch (error) {
        console.error(
            "Loan payment error:",
            error
        );

        // =====================================================
        // VALIDATION ERRORS
        // =====================================================

        const validationMessages = [
            "Payment exceeds outstanding balance",
            "This loan has already been fully paid",
            "Payment can only be made against a loan sale",
            "Sale not found",
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
        // SEQUELIZE VALIDATION
        // =====================================================

        if (
            error.name ===
            "SequelizeValidationError"
        ) {
            return res.status(400).json({
                successful: false,

                message:
                    "Loan payment validation failed",

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
        // GENERIC ERROR
        // =====================================================

        return res.status(500).json({
            successful: false,

            message:
                "Failed to record loan payment",

            error:
                error.message ||
                "Failed to record loan payment",
        });
    }
};
