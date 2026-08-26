"use strict";

import {
    products,
    productdetails,
    productbarcodes,
    brands,
    categories,
    units,
    taxgroups
} from "../../models/index.js";

import paginate from "../../afterwares/pagenate.js";

import { Op } from "sequelize";
import moment from "moment";

export default async (req, res) => {

    let where = {};

    const {
        q,
        pageInfo,
        day,
        status,
        categoryId,
        brandId
    } = req.query;

    const {
        sortBy = "createdAt",
        sortOrder = "DESC",
        page = 1,
        limit = 10,
        offset = 0
    } = pageInfo || {};

    try {

        // =====================================================
        // SEARCH
        // =====================================================

        if (q) {

            where = {
                ...where,

                [Op.or]: {
                    sku: {
                        [Op.like]: "%" + q + "%"
                    },

                    itemName: {
                        [Op.like]: "%" + q + "%"
                    },

                    productName: {
                        [Op.like]: "%" + q + "%"
                    }
                }
            };
        }

        // =====================================================
        // DAY FILTER
        // =====================================================

        if (day === "day") {

            where = {
                ...where,

                createdAt: {
                    [Op.gte]:
                        moment()
                            .subtract(1, "days")
                            .toDate()
                }
            };
        }

        if (day === "week") {

            where = {
                ...where,

                createdAt: {
                    [Op.gte]:
                        moment()
                            .subtract(7, "days")
                            .toDate()
                }
            };
        }

        if (day === "month") {

            where = {
                ...where,

                createdAt: {
                    [Op.gte]:
                        moment()
                            .subtract(30, "days")
                            .toDate()
                }
            };
        }

        // =====================================================
        // STATUS
        // =====================================================

        if (status) {

            where = {
                ...where,

                status
            };
        }

        // =====================================================
        // CATEGORY
        // =====================================================

        if (categoryId) {

            where = {
                ...where,

                categoryId
            };
        }

        // =====================================================
        // BRAND
        // =====================================================

        if (brandId) {

            where = {
                ...where,

                brandId
            };
        }

        // =====================================================
        // TOTAL COUNT
        // =====================================================

        const {
            count: Tcount
        } = await products.findAndCountAll({
            where,
            raw: true
        });

        // =====================================================
        // PRODUCTS
        // =====================================================

        const {
            rows,
            count
        } = await products.findAndCountAll({

            where,

            offset,

            limit,

            order: [
                [
                    sortBy,
                    sortOrder
                ]
            ],

            raw: true
        });

        if (!rows) {
            return res.json({
                successful: true,
                data: [],
                total: 0
            });
        }

        // =====================================================
        // GET RELATED DATA
        // =====================================================

        const productIds =
            rows.map(
                (item) => item.id
            );

        // Product details

        const details =
            await productdetails.findAll({
                where: {
                    productId: {
                        [Op.in]: productIds
                    }
                },
                raw: true
            });

        // Barcodes

        const barcodes =
            await productbarcodes.findAll({
                where: {
                    productId: {
                        [Op.in]: productIds
                    }
                },
                raw: true
            });

        // =====================================================
        // COMBINE DATA
        // =====================================================

        const newdata =
            rows.map((product) => {

                const productDetails =
                    details.find(
                        (item) =>
                            String(
                                item.productId
                            ) ===
                            String(
                                product.id
                            )
                    );

                const productBarcodes =
                    barcodes.filter(
                        (item) =>
                            String(
                                item.productId
                            ) ===
                            String(
                                product.id
                            )
                    );

                return {

                    ...product,

                    details:
                        productDetails ||
                        null,

                    barcodes:
                        productBarcodes
                };
            });

        // =====================================================
        // PAGINATION
        // =====================================================

        let data = paginate({

            totalCount: count,

            currentPage: page,

            pageSize: limit,

            data: newdata

        });

        data = {
            ...data,

            total: Tcount
        };

        return res.json(data);

    } catch (error) {

        console.log(
            "Product report error:",
            error
        );

        return res.status(500).json({

            successful: false,

            message:
                "Failed to fetch products",

            error:
                error.message
        });
    }
};
