"use strict";

import { db } from "../../models/index.js";
import paginate from "../../afterwares/pagenate.js";

import { Op } from "sequelize";
import moment from "moment";
import { has } from "../../middleware/auth/authorize.js";
import { PERMISSIONS } from "../../config/permissions.js";

// =====================================================
// MODELS
// =====================================================

const {
    product,
    productdetails,
    productbarcode,
    brand,
    category,
    unit,
    taxgroup,
    inventory,
} = db;

// =====================================================
// GET PRODUCTS
// =====================================================

export default async (req, res) => {

    // Every query is limited to the caller's store.
    let where = {
        tenantId: req.tenantId,
    };

    const {
        q,
        day,
        status,
        categoryId,
        brandId,
    } = req.query;

    // =====================================================
    // PAGINATION
    // =====================================================

    const {
        sortBy = "createdAt",
        sortOrder = "DESC",
        page = 1,
        limit = 10,
        offset = 0,
    } = req.query;

    try {

        // =====================================================
        // SEARCH
        // =====================================================

        if (q && String(q).trim()) {

            const search = String(q).trim();

            // ---------------------------------------------
            // FIND PRODUCTS BY BARCODE
            // ---------------------------------------------

            const barcodeMatches =
                await productbarcode.findAll({
                    where: {
                        tenantId: req.tenantId,
                        barcode: search,
                    },

                    attributes: ["productId"],

                    raw: true,
                });

            const barcodeProductIds =
                barcodeMatches.map(
                    (item) => item.productId
                );

            // ---------------------------------------------
            // PRODUCT SEARCH
            // ---------------------------------------------

            where[Op.or] = [
                // SKU
                {
                    sku: {
                        [Op.like]: `%${search}%`,
                    },
                },

                // ITEM NAME
                {
                    itemName: {
                        [Op.like]: `%${search}%`,
                    },
                },

                // PRODUCT NAME
                {
                    productName: {
                        [Op.like]: `%${search}%`,
                    },
                },
            ];

            // ---------------------------------------------
            // ADD BARCODE RESULTS
            // ---------------------------------------------

            if (barcodeProductIds.length > 0) {

                where[Op.or].push({
                    id: {
                        [Op.in]: barcodeProductIds,
                    },
                });
            }
        }

        // =====================================================
        // DATE FILTER
        // =====================================================

        if (day === "day") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(1, "day")
                    .toDate(),
            };
        }

        if (day === "week") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(7, "days")
                    .toDate(),
            };
        }

        if (day === "month") {

            where.createdAt = {
                [Op.gte]: moment()
                    .subtract(30, "days")
                    .toDate(),
            };
        }

        // =====================================================
        // STATUS
        // =====================================================

        if (status) {
            where.status = status;
        }

        // =====================================================
        // CATEGORY
        // =====================================================

        if (categoryId) {
            where.categoryId = categoryId;
        }

        // =====================================================
        // BRAND
        // =====================================================

        if (brandId) {
            where.brandId = brandId;
        }

        // =====================================================
        // PAGINATION VALUES
        // =====================================================

        const currentPage =
            Number(page) || 1;

        const pageSize =
            Number(limit) || 10;

        const pageOffset =
            Number(offset) ||
            (currentPage - 1) * pageSize;

        // =====================================================
        // SORTING
        // =====================================================

        const allowedSortFields = [
            "id",
            "sku",
            "itemName",
            "productName",
            "productType",
            "status",
            "createdAt",
            "updatedAt",
        ];

        const safeSortBy =
            allowedSortFields.includes(sortBy)
                ? sortBy
                : "createdAt";

        const safeSortOrder =
            String(sortOrder).toUpperCase() === "ASC"
                ? "ASC"
                : "DESC";

        // =====================================================
        // GET PRODUCTS
        // =====================================================

        const {
            rows,
            count,
        } = await product.findAndCountAll({

            where,

            offset: pageOffset,

            limit: pageSize,

            // Important because product hasMany barcodes
            distinct: true,

            order: [
                [
                    safeSortBy,
                    safeSortOrder,
                ],
            ],

            include: [

                // =================================================
                // BRAND
                // =================================================

                {
                    model: brand,
                    as: "brand",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // CATEGORY
                // =================================================

                {
                    model: category,
                    as: "category",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // UNIT
                // =================================================

                {
                    model: unit,
                    as: "unit",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // TAX GROUP
                // =================================================

                {
                    model: taxgroup,
                    as: "taxGroup",

                    required: false,

                    attributes: [
                        "id",
                        "name",
                        "status",
                    ],
                },

                // =================================================
                // PRODUCT DETAILS
                // =================================================

                {
                    model: productdetails,
                    as: "details",

                    required: false,
                },

                // =================================================
                // PRODUCT BARCODES
                // =================================================

                {
                    model: productbarcode,
                    as: "barcodes",

                    required: false,
                },

                // =================================================
                // STOCK
                // =================================================

                {
                    model: inventory,
                    as: "inventory",

                    required: false,

                    attributes: [
                        "quantity",
                        "reorderLevel",
                        "reorderQuantity",
                        "location",
                    ],
                },
            ],
        });

        // =====================================================
        // NO PRODUCTS
        // =====================================================

        const summary =
            await productSummary(req.tenantId);

        if (!rows || rows.length === 0) {

            return res.status(200).json({

                successful: true,

                data: [],

                total: 0,

                summary,

                pagination: {
                    currentPage,
                    pageSize,
                    totalPages: 0,
                    totalItems: 0,
                },

            });
        }

        // =====================================================
        // CONVERT SEQUELIZE INSTANCES TO JSON
        // =====================================================

        const canSeeCost =
            has(req, PERMISSIONS.PRODUCTS_VIEW_COST);

        const newdata =
            rows.map((item) => {

                const json = item.toJSON();

                // Cashiers must not see buying prices.
                if (!canSeeCost && json.details) {
                    delete json.details.costPrice;
                }

                return json;

            });

        // =====================================================
        // PAGINATION
        // =====================================================

        let data = paginate({

            totalCount: count,

            currentPage,

            pageSize,

            data: newdata,

        });

        // =====================================================
        // RESPONSE
        // =====================================================

        data = {

            ...data,

            successful: true,

            total: count,

            summary,

        };

        return res.status(200).json(data);

    } catch (error) {

        console.error(
            "Product report error:",
            error
        );

        return res.status(500).json({

            successful: false,

            message:
                "Failed to fetch products",

            error:
                "Failed to fetch products",

        });
    }
};

// =====================================================
// SUMMARY (whole store, ignores filters)
// =====================================================

async function productSummary(tenantId) {

    const [total, active, lowStock] =
        await Promise.all([
            product.count({ where: { tenantId } }),

            product.count({ where: { tenantId, status: "active" } }),

            inventory.count({
                where: {
                    tenantId,
                    quantity: {
                        [Op.lte]: db.sequelize.col("reorderLevel"),
                    },
                },
            }),
        ]);

    return {
        total,
        active,
        inactive: total - active,
        lowStock,
    };
}
