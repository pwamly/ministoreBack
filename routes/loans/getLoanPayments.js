"use strict";

import { Op } from "sequelize";
import db from "../../models/index.js";

const {
    loanPayments,
    sales,
    min_user,
} = db;

export default async (req, res) => {
    try {
        // =====================================================
        // VALIDATE MODELS
        // =====================================================

        if (!loanPayments) {
            throw new Error(
                "Loan payments model is not initialized"
            );
        }

        if (!sales) {
            throw new Error(
                "Sales model is not initialized"
            );
        }

        // =====================================================
        // QUERY PARAMETERS
        // =====================================================

        const {
            saleId,
            search,
            paymentMethod,
            startDate,
            endDate,
            page = 1,
            limit = 20,
        } = req.query;

        // =====================================================
        // NORMALIZE
        // =====================================================

        const cleanSaleId =
            saleId !== undefined &&
            saleId !== null &&
            String(saleId).trim() !== ""
                ? String(saleId).trim()
                : null;

        const cleanSearch =
            search !== undefined &&
            search !== null &&
            String(search).trim() !== ""
                ? String(search).trim()
                : null;

        const cleanPaymentMethod =
            paymentMethod !== undefined &&
            paymentMethod !== null &&
            String(paymentMethod).trim() !== ""
                ? String(paymentMethod)
                    .trim()
                    .toLowerCase()
                : null;

        const cleanPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const cleanLimit =
            Math.min(
                Math.max(
                    Number(limit) || 20,
                    1
                ),
                100
            );

        const offset =
            (cleanPage - 1) *
            cleanLimit;

        // =====================================================
        // BUILD WHERE
        // =====================================================

        const where = {};

        if (cleanSaleId) {
            where.saleId =
                cleanSaleId;
        }

        if (cleanPaymentMethod) {
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

            where.paymentMethod =
                cleanPaymentMethod;
        }

        // =====================================================
        // DATE FILTER
        // =====================================================

        if (
            startDate ||
            endDate
        ) {
            const paidAt = {};

            if (startDate) {
                paidAt[Op.gte] =
                    new Date(
                        `${startDate}T00:00:00`
                    );
            }

            if (endDate) {
                paidAt[Op.lte] =
                    new Date(
                        `${endDate}T23:59:59.999`
                    );
            }

            where.paidAt =
                paidAt;
        }

        // =====================================================
        // SEARCH
        // =====================================================

        if (cleanSearch) {
            where[Op.or] = [
                {
                    note: {
                        [Op.like]:
                            `%${cleanSearch}%`,
                    },
                },
                {
                    paymentMethod: {
                        [Op.like]:
                            `%${cleanSearch}%`,
                    },
                },
            ];
        }

        // =====================================================
        // GET PAYMENTS
        // =====================================================

        const {
            count,
            rows,
        } =
            await loanPayments.findAndCountAll({
                where,

                include: [
                    {
                        model:
                            sales,

                        as:
                            "sale",

                        required:
                            true,

                        attributes: [
                            "id",
                            "invoiceNumber",
                            "customerName",
                            "customerMobile",
                            "total",
                            "paidNow",
                            "paymentMethod",
                            "status",
                        ],
                    },

                    ...(min_user
                        ? [
                            {
                                model:
                                    min_user,

                                as:
                                    "user",

                                required:
                                    false,

                                attributes: [
                                    "id",
                                    "first_name",
                                    "last_name",
                                    "username",
                                ],
                            },
                        ]
                        : []),
                ],

                order: [
                    [
                        "paidAt",
                        "DESC",
                    ],
                ],

                limit:
                    cleanLimit,

                offset,

                distinct:
                    true,
            });

        // =====================================================
        // FORMAT
        // =====================================================

        const data =
            rows.map(
                (payment) => ({
                    id:
                        payment.id,

                    saleId:
                        payment.saleId,

                    amount:
                        Number(
                            payment.amount || 0
                        ),

                    paymentMethod:
                        payment.paymentMethod,

                    userId:
                        payment.userId,

                    note:
                        payment.note,

                    paidAt:
                        payment.paidAt,

                    createdAt:
                        payment.createdAt,

                    updatedAt:
                        payment.updatedAt,

                    sale:
                        payment.sale
                            ? {
                                id:
                                    payment.sale.id,

                                invoiceNumber:
                                    payment.sale.invoiceNumber,

                                customerName:
                                    payment.sale.customerName,

                                customerMobile:
                                    payment.sale.customerMobile,

                                total:
                                    Number(
                                        payment.sale.total ||
                                        0
                                    ),

                                paidNow:
                                    Number(
                                        payment.sale.paidNow ||
                                        0
                                    ),

                                remainingBalance:
                                    Number(
                                        Math.max(
                                            Number(
                                                payment.sale.total ||
                                                0
                                            ) -
                                            Number(
                                                payment.sale.paidNow ||
                                                0
                                            ),
                                            0
                                        ).toFixed(2)
                                    ),

                                paymentMethod:
                                    payment.sale.paymentMethod,

                                status:
                                    payment.sale.status,
                            }
                            : null,

                    user:
                        payment.user
                            ? {
                                id:
                                    payment.user.id,

                                firstName:
                                    payment.user.first_name,

                                lastName:
                                    payment.user.last_name,

                                username:
                                    payment.user.username,
                            }
                            : null,
                })
            );

        // =====================================================
        // SUMMARY
        // =====================================================

        const totalAmount =
            data.reduce(
                (total, payment) =>
                    total +
                    Number(
                        payment.amount || 0
                    ),
                0
            );

        // =====================================================
        // SUCCESS
        // =====================================================

        return res.status(200).json({
            successful: true,

            message:
                "Loan payments retrieved successfully",

            filters: {
                saleId:
                    cleanSaleId,

                search:
                    cleanSearch,

                paymentMethod:
                    cleanPaymentMethod,

                startDate:
                    startDate || null,

                endDate:
                    endDate || null,
            },

            pagination: {
                page:
                    cleanPage,

                limit:
                    cleanLimit,

                total:
                    count,

                totalPages:
                    count === 0
                        ? 1
                        : Math.ceil(
                            count /
                            cleanLimit
                        ),
            },

            summary: {
                transactions:
                    count,

                amount:
                    Number(
                        totalAmount.toFixed(2)
                    ),
            },

            data,
        });

    } catch (error) {
        console.error(
            "Get loan payments error:",
            error
        );

        return res.status(500).json({
            successful: false,

            message:
                "Failed to retrieve loan payments",

            error:
                error.message ||
                "Failed to retrieve loan payments",
        });
    }
};
